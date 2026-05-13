#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const scanRoots = ['app', 'src'];
const outputPath = path.join(rootDir, 'docs', 'android-performance-regression-check.md');
const ignoredDirectories = new Set([
  '.expo',
  '.git',
  'backend',
  'coverage',
  'dist',
  'node_modules',
]);
const codeExtensions = new Set(['.ts', '.tsx']);

function walkFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }

    if (entry.isFile() && codeExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function toRelativePath(filePath) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, '/');
}

function createIssue({ category, priority = 'Medium', file, line, reason, recommendation, evidence }) {
  return {
    category,
    evidence: evidence?.trim() ?? '',
    file: toRelativePath(file),
    line,
    priority,
    reason,
    recommendation,
  };
}

function getLineNumber(lines, index) {
  return index + 1;
}

function includesAny(value, patterns) {
  return patterns.some((pattern) => pattern.test(value));
}

function findScrollViewMapIssues(file, lines, content) {
  if (!content.includes('ScrollView') || !content.includes('.map(')) {
    return [];
  }

  const issues = [];
  const scrollStartIndexes = lines
    .map((line, index) => ({ index, line }))
    .filter(({ line }) => /<([A-Za-z]+\.)?ScrollView\b/.test(line))
    .map(({ index }) => index);

  for (const startIndex of scrollStartIndexes) {
    const endIndex = lines.findIndex((line, index) => index > startIndex && /<\/([A-Za-z]+\.)?ScrollView>/.test(line));
    const scanEndIndex = endIndex === -1 ? Math.min(lines.length - 1, startIndex + 180) : endIndex;
    const mapIndexes = [];

    for (let index = startIndex; index <= scanEndIndex; index += 1) {
      if (lines[index]?.includes('.map(')) {
        mapIndexes.push(index);
      }
    }

    if (mapIndexes.length === 0) {
      continue;
    }

    issues.push(createIssue({
      category: 'ScrollView + map 리스트',
      priority: mapIndexes.length >= 3 ? 'High' : 'Medium',
      file,
      line: getLineNumber(lines, mapIndexes[0]),
      reason: `ScrollView 내부에서 ${mapIndexes.length}개의 map 렌더링이 감지됐어요. 데이터가 늘면 Android에서 프레임 드랍 위험이 커집니다.`,
      recommendation: '긴 목록 가능성이 있으면 FlatList/SectionList로 바꾸고 keyExtractor/renderItem/useMemo를 사용하세요.',
      evidence: lines[mapIndexes[0]],
    }));
  }

  return issues;
}

function findRenderCalculationIssues(file, lines) {
  if (path.extname(file) !== '.tsx') {
    return [];
  }

  const issues = [];
  const riskyCalculationPattern = /\.(sort|filter|map)\(/;

  lines.forEach((line, index) => {
    if (!riskyCalculationPattern.test(line)) {
      return;
    }

    const previousWindow = lines.slice(Math.max(0, index - 4), index + 1).join('\n');
    const looksMemoized = previousWindow.includes('useMemo') || previousWindow.includes('useCallback');
    const looksLikeImportOrType = /^\s*(import|export|type)\b/.test(line);

    if (looksMemoized || looksLikeImportOrType) {
      return;
    }

    const jsxNearby = lines
      .slice(Math.max(0, index - 8), Math.min(lines.length, index + 8))
      .some((nearbyLine) => /return\s*\(|<[A-Z_a-z]/.test(nearbyLine));

    if (!jsxNearby) {
      return;
    }

    issues.push(createIssue({
      category: '렌더 중 sort/filter/map 계산',
      priority: line.includes('.sort(') ? 'High' : 'Medium',
      file,
      line: getLineNumber(lines, index),
      reason: '렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다.',
      recommendation: '정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요.',
      evidence: line,
    }));
  });

  return issues;
}

function findConsoleIssues(file, lines) {
  const issues = [];

  lines.forEach((line, index) => {
    if (!/console\.(log|warn|error)\(/.test(line)) {
      return;
    }

    issues.push(createIssue({
      category: '개발 로그',
      priority: line.includes('console.log') ? 'Medium' : 'Low',
      file,
      line: getLineNumber(lines, index),
      reason: '런타임 로그가 감지됐어요. 반복 렌더/위치 업데이트 구간이면 Android 성능과 로그 노이즈에 영향을 줄 수 있습니다.',
      recommendation: '출시 코드에서는 제거하거나 __DEV__ 조건/QA 전용 logger로 감싸세요.',
      evidence: line,
    }));
  });

  return issues;
}

function findEffectCleanupIssues(file, lines) {
  const issues = [];
  const effectStartPattern = /\buse(Effect|FocusEffect)\s*\(/;
  const cleanupTriggers = [
    /setInterval\(/,
    /setTimeout\(/,
    /addEventListener\(/,
    /watchPositionAsync\(/,
    /watchStepCount\(/,
    /subscribeBackgroundRunTracking\(/,
    /startLocationUpdatesAsync\(/,
  ];
  const cleanupPatterns = [
    /return\s*\(\)\s*=>/,
    /clearInterval\(/,
    /clearTimeout\(/,
    /\.remove\(\)/,
    /removeSubscription\(/,
    /stopLocationUpdatesAsync\(/,
    /unsubscribe\(/,
  ];

  lines.forEach((line, index) => {
    if (!effectStartPattern.test(line)) {
      return;
    }

    const nextEffectIndex = lines.findIndex((candidateLine, candidateIndex) => (
      candidateIndex > index && effectStartPattern.test(candidateLine)
    ));
    const dependencyArrayIndex = lines.findIndex((candidateLine, candidateIndex) => (
      candidateIndex > index && /^\s*},\s*\[/.test(candidateLine)
    ));
    const fallbackEndIndex = Math.min(lines.length, index + 45);
    const blockEndIndex = Math.min(
      nextEffectIndex === -1 ? fallbackEndIndex : nextEffectIndex,
      dependencyArrayIndex === -1 ? fallbackEndIndex : dependencyArrayIndex + 2,
    );
    const block = lines.slice(index, blockEndIndex).join('\n');

    if (!includesAny(block, cleanupTriggers)) {
      return;
    }

    if (includesAny(block, cleanupPatterns)) {
      return;
    }

    issues.push(createIssue({
      category: 'useEffect cleanup 누락 후보',
      priority: 'High',
      file,
      line: getLineNumber(lines, index),
      reason: 'effect 안에 timer/subscription/watcher 후보가 있지만 cleanup 패턴이 근처에서 보이지 않습니다.',
      recommendation: '화면 이탈 시 clearInterval/remove/stopLocationUpdatesAsync 같은 정리 로직이 실행되는지 확인하세요.',
      evidence: line,
    }));
  });

  return issues;
}

function findLocationWatcherIssues(file, lines, content) {
  const watcherPatterns = [
    /Location\.watchPositionAsync\(/,
    /\bwatchPositionAsync\(/,
    /Location\.startLocationUpdatesAsync\(/,
    /\bstartLocationUpdatesAsync\(/,
    /Pedometer\.watchStepCount\(/,
    /\bwatchStepCount\(/,
    /\bsubscribeBackgroundRunTracking\(/,
  ];
  const cleanupPatterns = [
    /return\s*\(\)\s*=>/,
    /\.remove\(\)/,
    /stopLocationUpdatesAsync\(/,
    /resetBackgroundRunTracking\(/,
    /stopPedometerSubscription\(/,
    /unsubscribe\(/,
  ];
  const watcherIndexes = lines
    .map((line, index) => ({ index, line }))
    .filter(({ line }) => includesAny(line, watcherPatterns));

  if (watcherIndexes.length === 0) {
    return [];
  }

  const issues = [];

  if (watcherIndexes.length > 1) {
    issues.push(createIssue({
      category: '위치/센서 watcher 중복 후보',
      priority: 'High',
      file,
      line: getLineNumber(lines, watcherIndexes[0].index),
      reason: `한 파일에서 watcher 후보가 ${watcherIndexes.length}개 감지됐어요. 조건 없이 동시에 등록되면 Android에서 병목이 커질 수 있습니다.`,
      recommendation: '화면 focus 상태, match 상태, tracker 상태에 따라 단 하나만 활성화되는지 확인하세요.',
      evidence: watcherIndexes.map(({ line }) => line.trim()).join(' / '),
    }));
  }

  for (const { index, line } of watcherIndexes) {
    const localBlock = lines.slice(index, Math.min(lines.length, index + 90)).join('\n');

    if (!includesAny(localBlock, cleanupPatterns) && !includesAny(content, cleanupPatterns)) {
      issues.push(createIssue({
        category: '위치/센서 watcher cleanup 누락 후보',
        priority: 'High',
        file,
        line: getLineNumber(lines, index),
        reason: 'watcher 등록 후보가 있지만 remove/stop cleanup 패턴이 확인되지 않습니다.',
        recommendation: 'subscription.remove(), stopLocationUpdatesAsync(), foreground helper 정리 등이 화면 이탈 시 실행되는지 확인하세요.',
        evidence: line,
      }));
    }
  }

  return issues;
}

function findMapUpdateIssues(file, lines, content) {
  const usesMaps = content.includes('react-native-maps') || content.includes('<MapView') || content.includes('<Polyline') || content.includes('<Marker');

  if (!usesMaps) {
    return [];
  }

  const issues = [];

  lines.forEach((line, index) => {
    const isMapElement = /<(MapView|Polyline|Marker)\b/.test(line);
    const usesInlineObject = /coordinate=\{\{|region=\{\{|initialRegion=\{\{/.test(line);
    const mapsCoordinates = /coordinates=\{.*\.map\(/.test(line) || /route.*\.map\(/.test(line);

    if (!isMapElement && !usesInlineObject && !mapsCoordinates) {
      return;
    }

    issues.push(createIssue({
      category: 'react-native-maps 업데이트 후보',
      priority: mapsCoordinates ? 'High' : 'Medium',
      file,
      line: getLineNumber(lines, index),
      reason: '지도/마커/폴리라인 props가 렌더마다 새 객체/배열로 만들어질 가능성이 있습니다.',
      recommendation: 'coordinates/region/marker props는 useMemo로 안정화하고, 위치 업데이트 주기를 과하게 짧게 잡지 마세요.',
      evidence: line,
    }));
  });

  if (issues.length === 0) {
    issues.push(createIssue({
      category: 'react-native-maps 사용 파일',
      priority: 'Low',
      file,
      line: 1,
      reason: '지도 사용 파일입니다. Android에서 위치 업데이트와 함께 렌더 비용이 커질 수 있어 QA 관찰 대상입니다.',
      recommendation: '실기기에서 지도 이동, 마커 갱신, 폴리라인 갱신 시 FPS와 입력 지연을 확인하세요.',
      evidence: 'react-native-maps',
    }));
  }

  return issues;
}

function analyzeFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);

  return [
    ...findScrollViewMapIssues(file, lines, content),
    ...findRenderCalculationIssues(file, lines),
    ...findConsoleIssues(file, lines),
    ...findEffectCleanupIssues(file, lines),
    ...findLocationWatcherIssues(file, lines, content),
    ...findMapUpdateIssues(file, lines, content),
  ];
}

function priorityWeight(priority) {
  return {
    High: 0,
    Medium: 1,
    Low: 2,
  }[priority] ?? 3;
}

function toMarkdownTable(issues) {
  if (issues.length === 0) {
    return '현재 휴리스틱 기준으로 감지된 항목이 없습니다.\n';
  }

  const rows = issues.map((issue) => [
    issue.priority,
    issue.category,
    `${issue.file}:${issue.line}`,
    issue.reason,
    issue.recommendation,
  ]);

  return [
    '| 우선순위 | 항목 | 위치 | 이유 | 권장 확인 |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row.map((cell) => String(cell).replaceAll('|', '\\|').replaceAll('\n', '<br>')).join(' | ')} |`),
    '',
  ].join('\n');
}

function buildReport(issues) {
  const now = new Date().toISOString();
  const grouped = new Map();

  for (const issue of issues) {
    grouped.set(issue.category, (grouped.get(issue.category) ?? 0) + 1);
  }

  const summaryRows = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'ko'))
    .map(([category, count]) => `| ${category} | ${count} |`);

  const highIssues = issues.filter((issue) => issue.priority === 'High');
  const mediumIssues = issues.filter((issue) => issue.priority === 'Medium');
  const lowIssues = issues.filter((issue) => issue.priority === 'Low');

  return [
    '# Android 성능 회귀 방지 체크',
    '',
    `생성 시각: ${now}`,
    '',
    '이 문서는 `scripts/check-performance-smells.mjs`가 앱 코드의 성능 회귀 후보를 정적으로 점검한 결과입니다. 자동 수정은 하지 않고, Android 실기기 QA 전에 확인할 위험 후보만 모읍니다.',
    '',
    '## 실행 방법',
    '',
    '```bash',
    'npm run performance:smells',
    '```',
    '',
    '## 점검 기준',
    '',
    '- `ScrollView` 내부에서 `.map()`으로 긴 리스트를 렌더링하는 후보',
    '- 렌더링 경로 근처의 `.sort()`, `.filter()`, `.map()` 반복 계산 후보',
    '- 위치/센서 watcher 중복 등록 후보',
    '- timer/subscription/watcher가 있는 `useEffect` cleanup 누락 후보',
    '- 출시 코드에 남은 `console.log`, `console.warn`, `console.error` 후보',
    '- `react-native-maps`의 마커/폴리라인/region 과다 업데이트 후보',
    '',
    '## 요약',
    '',
    `- 전체 감지 항목: ${issues.length}개`,
    `- High: ${highIssues.length}개`,
    `- Medium: ${mediumIssues.length}개`,
    `- Low: ${lowIssues.length}개`,
    '',
    summaryRows.length
      ? [
          '| 항목 | 개수 |',
          '| --- | --- |',
          ...summaryRows,
          '',
        ].join('\n')
      : '감지된 항목이 없습니다.\n',
    '## High',
    '',
    toMarkdownTable(highIssues),
    '## Medium',
    '',
    toMarkdownTable(mediumIssues),
    '## Low',
    '',
    toMarkdownTable(lowIssues),
    '## 해석 규칙',
    '',
    '- 이 스크립트는 정적 휴리스틱이라 false positive가 있을 수 있습니다.',
    '- High 항목은 Android 렉/화면 튐과 직접 연결될 수 있어 먼저 확인합니다.',
    '- Medium 항목은 데이터가 늘 때 문제가 될 가능성이 있는 구조입니다.',
    '- Low 항목은 실기기 QA 때 관찰 대상으로 남깁니다.',
    '- 자동 수정은 하지 않습니다. 기능/UI 변경 없이 사람이 확인한 뒤 별도 리팩토링합니다.',
    '',
  ].join('\n');
}

const files = scanRoots.flatMap((scanRoot) => walkFiles(path.join(rootDir, scanRoot)));
const issues = files
  .flatMap(analyzeFile)
  .sort((left, right) => (
    priorityWeight(left.priority) - priorityWeight(right.priority)
    || left.file.localeCompare(right.file)
    || left.line - right.line
  ));

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, buildReport(issues));

const summary = issues.reduce((accumulator, issue) => {
  accumulator[issue.priority] = (accumulator[issue.priority] ?? 0) + 1;
  return accumulator;
}, {});

console.log(`Android performance smell check complete: ${issues.length} issue(s)`);
console.log(`High: ${summary.High ?? 0}, Medium: ${summary.Medium ?? 0}, Low: ${summary.Low ?? 0}`);
console.log(`Report: ${path.relative(rootDir, outputPath)}`);
