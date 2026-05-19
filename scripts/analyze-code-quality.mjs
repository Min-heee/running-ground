#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = process.cwd();
const outputPath = path.join(rootDir, 'docs', 'code-quality-report.generated.md');
const outputRelativePath = 'docs/code-quality-report.generated.md';

const scanRoots = [
  'app',
  'src',
  'backend/src',
  'scripts',
  'docs',
];

const ignoredDirectories = new Set([
  '.expo',
  '.git',
  'android',
  'coverage',
  'credentials',
  'dist',
  'ios',
  'node_modules',
]);

const ignoredFiles = new Set([
  outputRelativePath,
]);

const codeExtensions = new Set([
  '.cjs',
  '.js',
  '.jsx',
  '.mjs',
  '.ts',
  '.tsx',
]);

const textExtensions = new Set([
  ...codeExtensions,
  '.json',
  '.md',
]);

const MAX_TABLE_ROWS = 80;

const priorities = {
  High: 3,
  Medium: 2,
  Low: 1,
};

function toRelativePath(filePath) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, '/');
}

function shouldScanFile(filePath) {
  const relativePath = toRelativePath(filePath);

  if (ignoredFiles.has(relativePath)) {
    return false;
  }

  return scanRoots.some((scanRoot) => (
    relativePath === scanRoot || relativePath.startsWith(`${scanRoot}/`)
  ));
}

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

    if (entry.isFile() && shouldScanFile(fullPath) && textExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function countMatches(content, pattern) {
  return content.match(pattern)?.length ?? 0;
}

function truncate(value, maxLength = 120) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function escapeMarkdown(value) {
  return String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replaceAll('\n', '<br>');
}

function getLineNumber(lineIndex) {
  return lineIndex + 1;
}

function createIssue({
  category,
  evidence = '',
  file,
  line = '',
  priority = 'Medium',
  reason,
  recommendation,
  score = 0,
}) {
  return {
    category,
    evidence: truncate(evidence),
    file,
    line,
    priority,
    reason,
    recommendation,
    score,
  };
}

function readPackageScripts() {
  const packagePath = path.join(rootDir, 'package.json');

  if (!fs.existsSync(packagePath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(packagePath, 'utf8')).scripts ?? {};
}

function getFileMetrics(filePath) {
  const relativePath = toRelativePath(filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const extension = path.extname(filePath);
  const isCode = codeExtensions.has(extension);
  const isTsx = extension === '.tsx' || extension === '.jsx';

  const inlineStyleCount = countMatches(content, /style=\{\s*\{/g);
  const inlineObjectPropCount = isTsx ? countMatches(content, /\b[A-Za-z][\w$]*=\{\s*\{[^}\n]*[:]/g) : 0;
  const inlineArrayPropCount = isTsx ? countMatches(content, /\b[A-Za-z][\w$]*=\{\s*\[/g) : 0;
  const inlineFunctionPropCount = isTsx ? countMatches(content, /\b[A-Za-z][\w$]*=\{\s*(?:async\s*)?\([^)]*\)\s*=>/g) : 0;
  const typeDeclarationCount = countMatches(content, /\b(?:export\s+)?(?:interface\s+[A-Z]\w*|type\s+[A-Z]\w*\s*=)/g);
  const apiCallCount = countMatches(content, /\bapi(?:Get|Post|Put|Patch|Delete|Request)\s*\(/g);
  const fetchCallCount = countMatches(content, /\bfetch\s*\(/g);
  const calculationSignalCount = countMatches(
    content,
    /\b(?:calculate|compute|derive|format|normalize|rank|sort|score|pace|distance|duration|build[A-Z]\w*Model|to[A-Z]\w*)\b/g,
  );
  const locationSignalCount = countMatches(
    content,
    /\b(?:Location\.|watchPositionAsync|startLocationUpdatesAsync|stopLocationUpdatesAsync|TaskManager|background task|Background|AppState)\b/g,
  );

  return {
    apiCallCount,
    calculationSignalCount,
    content,
    extension,
    fetchCallCount,
    filePath,
    importCount: countMatches(content, /\bimport\b/g),
    inlineArrayPropCount,
    inlineFunctionPropCount,
    inlineObjectPropCount,
    inlineStyleCount,
    isCode,
    isTsx,
    lines,
    lineCount: lines.length,
    locationSignalCount,
    relativePath,
    scrollViewMap: /<([A-Za-z]+\.)?ScrollView\b[\s\S]{0,2500}\.map\s*\(/.test(content),
    sortFilterMapCount: countMatches(content, /\.(?:sort|filter|map)\s*\(/g),
    subscriptionCount: countMatches(
      content,
      /\b(?:addEventListener|watchPositionAsync|watchStepCount|subscribeBackgroundRunTracking|startLocationUpdatesAsync)\b/g,
    ),
    timerCount: countMatches(content, /\bset(?:Interval|Timeout)\s*\(/g),
    typeDeclarationCount,
    useCallbackCount: countMatches(content, /\buseCallback\s*\(/g),
    useEffectCount: countMatches(content, /\buseEffect\s*\(/g),
    useFocusEffectCount: countMatches(content, /\buseFocusEffect\s*\(/g),
    useMemoCount: countMatches(content, /\buseMemo\s*\(/g),
    useStateCount: countMatches(content, /\buseState\s*\(/g),
  };
}

function lineNumberFromIndex(content, targetIndex) {
  return content.slice(0, targetIndex).split(/\r?\n/).length;
}

function findLargeFunctions(metrics) {
  if (!metrics.isCode) {
    return [];
  }

  const functionPattern = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?function\s*\([^)]*\)\s*\{|(?:useCallback|useMemo)\s*\(\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/g;
  const functions = [];
  let match;

  while ((match = functionPattern.exec(metrics.content))) {
    const openingBraceIndex = metrics.content.indexOf('{', functionPattern.lastIndex - 1);

    if (openingBraceIndex === -1) {
      continue;
    }

    let depth = 0;
    let endIndex = -1;

    for (let index = openingBraceIndex; index < metrics.content.length; index += 1) {
      const character = metrics.content[index];

      if (character === '{') {
        depth += 1;
      } else if (character === '}') {
        depth -= 1;

        if (depth === 0) {
          endIndex = index;
          break;
        }
      }
    }

    if (endIndex === -1) {
      continue;
    }

    const startLine = lineNumberFromIndex(metrics.content, match.index);
    const endLine = lineNumberFromIndex(metrics.content, endIndex);
    const lineCount = endLine - startLine + 1;

    if (lineCount < 50) {
      continue;
    }

    functions.push({
      file: metrics.relativePath,
      line: startLine,
      lines: lineCount,
      name: match[1] ?? match[2] ?? match[3] ?? (match[0].startsWith('useCallback') ? 'callback@useCallback' : 'callback@useMemo'),
    });
  }

  return functions;
}

function isMemoizedNearby(lines, index) {
  return lines
    .slice(Math.max(0, index - 5), index + 1)
    .some((line) => line.includes('useMemo') || line.includes('useCallback'));
}

function isRenderNearby(lines, index) {
  return lines
    .slice(Math.max(0, index - 8), Math.min(lines.length, index + 8))
    .some((line) => /return\s*\(|<[A-Z_a-z]/.test(line));
}

function findRenderCalculationIssues(metrics) {
  if (!metrics.isTsx) {
    return [];
  }

  return metrics.lines.flatMap((line, index) => {
    if (!/\.(?:sort|filter|map)\s*\(/.test(line)) {
      return [];
    }

    if (/^\s*(import|export|type)\b/.test(line) || isMemoizedNearby(metrics.lines, index) || !isRenderNearby(metrics.lines, index)) {
      return [];
    }

    return createIssue({
      category: '렌더 중 sort/filter/map 후보',
      evidence: line,
      file: metrics.relativePath,
      line: getLineNumber(index),
      priority: line.includes('.sort(') ? 'High' : 'Medium',
      reason: '렌더링 경로 근처에서 반복 계산이 감지됐다.',
      recommendation: '결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다.',
      score: line.includes('.sort(') ? 30 : 20,
    });
  });
}

function findInlinePropIssues(metrics) {
  if (!metrics.isTsx) {
    return [];
  }

  const inlinePropCount = metrics.inlineStyleCount
    + metrics.inlineObjectPropCount
    + metrics.inlineArrayPropCount
    + metrics.inlineFunctionPropCount;

  if (inlinePropCount === 0) {
    return [];
  }

  const firstLineIndex = metrics.lines.findIndex((line) => (
    /style=\{\s*\{|\b[A-Za-z][\w$]*=\{\s*[\[{]|\b[A-Za-z][\w$]*=\{\s*(?:async\s*)?\([^)]*\)\s*=>/.test(line)
  ));

  return [createIssue({
    category: 'inline object/array/style prop 후보',
    evidence: firstLineIndex === -1 ? '' : metrics.lines[firstLineIndex],
    file: metrics.relativePath,
    line: firstLineIndex === -1 ? '' : getLineNumber(firstLineIndex),
    priority: inlinePropCount >= 12 ? 'High' : inlinePropCount >= 5 ? 'Medium' : 'Low',
    reason: `inline style/object/array/function prop ${inlinePropCount}개가 감지됐다.`,
    recommendation: '반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다.',
    score: inlinePropCount,
  })];
}

function findCleanupIssues(metrics) {
  if (!metrics.isCode) {
    return [];
  }

  const issues = [];
  const effectStartPattern = /\buse(?:Effect|FocusEffect)\s*\(/;
  const cleanupTriggerPatterns = [
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

  metrics.lines.forEach((line, index) => {
    if (!effectStartPattern.test(line)) {
      return;
    }

    const nextEffectIndex = metrics.lines.findIndex((candidateLine, candidateIndex) => (
      candidateIndex > index && effectStartPattern.test(candidateLine)
    ));
    const dependencyArrayIndex = metrics.lines.findIndex((candidateLine, candidateIndex) => (
      candidateIndex > index && /^\s*},\s*\[/.test(candidateLine)
    ));
    const fallbackEndIndex = Math.min(metrics.lines.length, index + 60);
    const blockEndIndex = Math.min(
      nextEffectIndex === -1 ? fallbackEndIndex : nextEffectIndex,
      dependencyArrayIndex === -1 ? fallbackEndIndex : dependencyArrayIndex + 2,
    );
    const block = metrics.lines.slice(index, blockEndIndex).join('\n');
    const hasCleanupTrigger = cleanupTriggerPatterns.some((pattern) => pattern.test(block));
    const hasCleanup = cleanupPatterns.some((pattern) => pattern.test(block));

    if (!hasCleanupTrigger || hasCleanup) {
      return;
    }

    issues.push(createIssue({
      category: 'timer/subscription cleanup 의심',
      evidence: line,
      file: metrics.relativePath,
      line: getLineNumber(index),
      priority: 'High',
      reason: 'effect 내부에 timer/subscription 후보가 있지만 cleanup 패턴이 같은 block에서 감지되지 않았다.',
      recommendation: 'unmount, dependency 변경, focus 해제 시 clear/remove/stop이 보장되는지 확인한다.',
      score: 40,
    }));
  });

  if (metrics.timerCount > 0 && !metrics.content.includes('clearTimeout') && !metrics.content.includes('clearInterval')) {
    issues.push(createIssue({
      category: 'timer cleanup 의심',
      evidence: 'setTimeout/setInterval without clear pattern',
      file: metrics.relativePath,
      priority: 'Medium',
      reason: '파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다.',
      recommendation: 'non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다.',
      score: metrics.timerCount * 10,
    }));
  }

  return issues;
}

function isAllowedApiBoundary(relativePath) {
  return relativePath.startsWith('src/services/')
    || relativePath.startsWith('src/lib/api/')
    || relativePath.startsWith('backend/src/')
    || relativePath.startsWith('scripts/');
}

function findServiceBoundaryIssues(metrics) {
  if (!metrics.isCode) {
    return [];
  }

  const apiUsageCount = metrics.fetchCallCount + metrics.apiCallCount;

  if (apiUsageCount === 0 || isAllowedApiBoundary(metrics.relativePath)) {
    return [];
  }

  const firstLineIndex = metrics.lines.findIndex((line) => /\b(?:fetch|apiGet|apiPost|apiPut|apiPatch|apiDelete|apiRequest)\s*\(/.test(line));

  return [createIssue({
    category: 'services 밖 API 호출 후보',
    evidence: firstLineIndex === -1 ? '' : metrics.lines[firstLineIndex],
    file: metrics.relativePath,
    line: firstLineIndex === -1 ? '' : getLineNumber(firstLineIndex),
    priority: 'High',
    reason: `services/lib api 경계 밖에서 API 호출 ${apiUsageCount}개가 감지됐다.`,
    recommendation: '화면/hook에서는 service 함수만 호출하도록 옮긴다.',
    score: apiUsageCount * 20,
  })];
}

function isUtilityBoundary(relativePath) {
  const fileName = relativePath.split('/').pop() ?? '';

  return /\/(?:utils|domain|viewModels|lifecycle|tracking)\//.test(relativePath)
    || relativePath.startsWith('src/domain/')
    || relativePath.startsWith('src/lib/api/services/')
    || relativePath.startsWith('backend/src/repositories/')
    || relativePath.startsWith('backend/src/bridges/')
    || relativePath.startsWith('backend/src/services/')
    || relativePath.startsWith('backend/src/lib/')
    || relativePath.startsWith('scripts/')
    || relativePath === 'backend/src/store.mjs'
    || /Queries\.(?:mjs|tsx?)$/i.test(fileName)
    || /Policy\.(?:mjs|tsx?)$/i.test(fileName)
    || /Helpers?\.(?:mjs|tsx?)$/i.test(fileName)
    || /Builders?\.(?:mjs|tsx?)$/i.test(fileName)
    || /Store\.(?:mjs|tsx?)$/i.test(fileName)
    || /Repository\.(?:mjs|tsx?)$/i.test(fileName);
}

function findCalculationPlacementIssues(metrics) {
  if (!metrics.isCode || isUtilityBoundary(metrics.relativePath)) {
    return [];
  }

  if (metrics.calculationSignalCount < 5 && metrics.sortFilterMapCount < 4) {
    return [];
  }

  return [createIssue({
    category: 'utils/domain 이동 계산 후보',
    evidence: `calculation signals=${metrics.calculationSignalCount}, sort/filter/map=${metrics.sortFilterMapCount}`,
    file: metrics.relativePath,
    priority: metrics.sortFilterMapCount >= 8 ? 'High' : 'Medium',
    reason: '계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다.',
    recommendation: '순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다.',
    score: metrics.calculationSignalCount + metrics.sortFilterMapCount,
  })];
}

function isTypeBoundary(relativePath) {
  return /\/types\//.test(relativePath)
    || relativePath.startsWith('src/domain/')
    || relativePath.startsWith('src/lib/api/types/')
    || /\.types\.tsx?$/.test(relativePath)
    || /Types\.tsx?$/.test(relativePath)
    || relativePath.endsWith('.test.ts')
    || relativePath.endsWith('.test.tsx')
    || relativePath.endsWith('.test.mjs');
}

function findTypePlacementIssues(metrics) {
  if (!metrics.isCode || isTypeBoundary(metrics.relativePath) || metrics.typeDeclarationCount < 3) {
    return [];
  }

  return [createIssue({
    category: 'types 밖 타입 선언 후보',
    evidence: `type/interface declarations=${metrics.typeDeclarationCount}`,
    file: metrics.relativePath,
    priority: metrics.typeDeclarationCount >= 8 ? 'High' : 'Medium',
    reason: '여러 타입/interface 선언이 types/domain 경계 밖에 있다.',
    recommendation: '공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다.',
    score: metrics.typeDeclarationCount * 5,
  })];
}

function findEffectHeavyIssues(metrics) {
  const effectCount = metrics.useEffectCount + metrics.useFocusEffectCount;

  if (!metrics.isCode || effectCount < 4) {
    return [];
  }

  return [createIssue({
    category: 'useEffect 많은 파일',
    evidence: `useEffect=${metrics.useEffectCount}, useFocusEffect=${metrics.useFocusEffectCount}`,
    file: metrics.relativePath,
    priority: effectCount >= 8 ? 'High' : 'Medium',
    reason: 'effect가 많아 dependency 변경과 cleanup 회귀 위험이 높다.',
    recommendation: 'effect를 책임별 hook으로 분리하고, dependency/result dedupe 테스트를 추가한다.',
    score: effectCount * 10,
  })];
}

function findPropsWithoutMemoIssues(metrics) {
  if (!metrics.isTsx) {
    return [];
  }

  const inlinePropCount = metrics.inlineStyleCount
    + metrics.inlineObjectPropCount
    + metrics.inlineArrayPropCount
    + metrics.inlineFunctionPropCount;
  const memoBoundaryCount = metrics.useMemoCount + metrics.useCallbackCount;

  if (inlinePropCount < 5 || memoBoundaryCount > 0) {
    return [];
  }

  return [createIssue({
    category: 'memo 경계 없는 props 생성 후보',
    evidence: `inline props=${inlinePropCount}, useMemo/useCallback=0`,
    file: metrics.relativePath,
    priority: inlinePropCount >= 12 ? 'High' : 'Medium',
    reason: 'props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다.',
    recommendation: '반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다.',
    score: inlinePropCount * 5,
  })];
}

function findLocationIssues(metrics) {
  if (!metrics.isCode || metrics.locationSignalCount === 0) {
    return [];
  }

  if (metrics.relativePath.startsWith('scripts/')) {
    return [];
  }

  const firstLineIndex = metrics.lines.findIndex((line) => (
    /\b(?:Location\.|watchPositionAsync|startLocationUpdatesAsync|TaskManager|AppState)\b/.test(line)
  ));
  const hasLocationRuntimeSignal = metrics.lines.some((line) => (
    /\b(?:Location\.|watchPositionAsync|startLocationUpdatesAsync|stopLocationUpdatesAsync|TaskManager|background task|Background)\b/.test(line)
  ));
  const priority = metrics.relativePath.includes('tracking') || !hasLocationRuntimeSignal
    ? 'Medium'
    : 'High';

  return [createIssue({
    category: 'Location/watch/background task 사용 후보',
    evidence: firstLineIndex === -1 ? `signals=${metrics.locationSignalCount}` : metrics.lines[firstLineIndex],
    file: metrics.relativePath,
    line: firstLineIndex === -1 ? '' : getLineNumber(firstLineIndex),
    priority,
    reason: '위치 watcher/background task/AppState 관련 코드가 감지됐다.',
    recommendation: 'single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다.',
    score: metrics.locationSignalCount * 10,
  })];
}

function findDuplicateFileCandidates(metricsList) {
  const duplicateNameGroups = new Map();
  const roleGroups = new Map();
  const commonNames = new Set(['index', 'styles', 'types', 'constants', 'helpers', 'utils']);

  for (const metrics of metricsList.filter((item) => item.isCode)) {
    const fileName = path.basename(metrics.relativePath, metrics.extension);
    const normalizedName = fileName.toLowerCase();

    if (!commonNames.has(normalizedName) && !normalizedName.endsWith('.test')) {
      const group = duplicateNameGroups.get(normalizedName) ?? [];
      group.push(metrics.relativePath);
      duplicateNameGroups.set(normalizedName, group);
    }

    const role = [
      [/button/i, 'Button 계열'],
      [/card/i, 'Card 계열'],
      [/ranking|rank/i, 'Ranking 계열'],
      [/service/i, 'Service 계열'],
      [/repository/i, 'Repository 계열'],
      [/route/i, 'Route 계열'],
    ].find(([pattern]) => pattern.test(fileName))?.[1];

    if (role) {
      const group = roleGroups.get(role) ?? [];
      group.push(metrics.relativePath);
      roleGroups.set(role, group);
    }
  }

  const duplicateNames = [...duplicateNameGroups.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([name, files]) => createIssue({
      category: '동일 파일명 후보',
      evidence: files.slice(0, 8).join(', '),
      file: name,
      priority: 'Medium',
      reason: `같은 basename을 가진 파일 ${files.length}개가 있다.`,
      recommendation: '역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다.',
      score: files.length,
    }));

  const duplicateRoles = [...roleGroups.entries()]
    .filter(([, files]) => files.length >= 8)
    .map(([name, files]) => createIssue({
      category: '비슷한 역할 파일 후보',
      evidence: files.slice(0, 10).join(', '),
      file: name,
      priority: files.length >= 20 ? 'High' : 'Medium',
      reason: `${name} 파일이 ${files.length}개 있다.`,
      recommendation: '공통 primitive와 feature-specific wrapper 경계를 다시 확인한다.',
      score: files.length,
    }));

  return [...duplicateNames, ...duplicateRoles].sort(sortIssues);
}

function sortIssues(left, right) {
  return (priorities[right.priority] - priorities[left.priority])
    || (right.score - left.score)
    || String(left.file).localeCompare(String(right.file));
}

function createMarkdownTable(rows, columns) {
  if (rows.length === 0) {
    return '없음\n';
  }

  const header = `| ${columns.map((column) => column.header).join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => (
    `| ${columns.map((column) => escapeMarkdown(column.value(row))).join(' | ')} |`
  ));

  return [header, divider, ...body].join('\n');
}

function printTable(title, rows, columns) {
  console.log(`\n${title}`);
  console.log(createMarkdownTable(rows, columns));
}

function createSection(title, rows, columns, description = '') {
  const limitedRows = rows.slice(0, MAX_TABLE_ROWS);
  const overflowNote = rows.length > MAX_TABLE_ROWS
    ? `\n\n> ${rows.length}개 중 상위 ${MAX_TABLE_ROWS}개만 표시합니다.\n`
    : '';

  return [
    `## ${title}`,
    description,
    overflowNote,
    createMarkdownTable(limitedRows, columns),
  ].filter(Boolean).join('\n\n');
}

function buildReport({
  bigFiles300,
  bigFiles500,
  duplicateCandidates,
  functionCandidates,
  issueGroups,
  metricsList,
  packageScripts,
}) {
  const generatedAt = new Date().toISOString();
  const codeFiles = metricsList.filter((metrics) => metrics.isCode);
  const summaryRows = [
    ['분석 파일', metricsList.length],
    ['코드 파일', codeFiles.length],
    ['package scripts', Object.keys(packageScripts).length],
    ['300줄 이상 파일', bigFiles300.length],
    ['500줄 이상 파일', bigFiles500.length],
    ['50줄 이상 함수 후보', functionCandidates.length],
    ['순환 import 검사', '별도 정적 graph가 아닌 파일 단위 휴리스틱'],
  ].map(([metric, value]) => ({ metric, value }));

  const issueSummaryRows = Object.entries(issueGroups).map(([category, rows]) => ({
    category,
    count: rows.length,
    high: rows.filter((issue) => issue.priority === 'High').length,
    medium: rows.filter((issue) => issue.priority === 'Medium').length,
    low: rows.filter((issue) => issue.priority === 'Low').length,
  }));

  const fileColumns = [
    { header: '파일', value: (row) => row.relativePath },
    { header: '줄', value: (row) => row.lineCount },
    { header: '신호', value: (row) => [
      row.importCount ? `imports ${row.importCount}` : '',
      row.useEffectCount ? `effects ${row.useEffectCount}` : '',
      row.useFocusEffectCount ? `focusEffects ${row.useFocusEffectCount}` : '',
      row.sortFilterMapCount ? `sort/filter/map ${row.sortFilterMapCount}` : '',
      row.timerCount ? `timers ${row.timerCount}` : '',
      row.subscriptionCount ? `subs ${row.subscriptionCount}` : '',
    ].filter(Boolean).join(', ') },
  ];
  const issueColumns = [
    { header: '우선순위', value: (row) => row.priority },
    { header: '파일', value: (row) => row.file },
    { header: '줄', value: (row) => row.line },
    { header: '이유', value: (row) => row.reason },
    { header: '권장 조치', value: (row) => row.recommendation },
    { header: '근거', value: (row) => row.evidence },
  ];

  return [
    '# 코드 품질 자동 분석 리포트',
    '',
    '> 이 파일은 `npm run code:quality`로 생성됩니다. 수동 수정하지 말고 스크립트를 다시 실행해 갱신하세요.',
    '',
    `생성 시각: ${generatedAt}`,
    '',
    '## 실행 방법',
    '',
    '```bash',
    'npm run code:quality',
    '```',
    '',
    '## 요약',
    '',
    createMarkdownTable(summaryRows, [
      { header: '항목', value: (row) => row.metric },
      { header: '값', value: (row) => row.value },
    ]),
    '',
    '## 감지 항목 요약',
    '',
    createMarkdownTable(issueSummaryRows, [
      { header: '항목', value: (row) => row.category },
      { header: '전체', value: (row) => row.count },
      { header: 'High', value: (row) => row.high },
      { header: 'Medium', value: (row) => row.medium },
      { header: 'Low', value: (row) => row.low },
    ]),
    '',
    createSection('300줄 이상 파일', bigFiles300, fileColumns),
    '',
    createSection('500줄 이상 파일', bigFiles500, fileColumns),
    '',
    createSection('50줄 이상 함수 후보', functionCandidates, [
      { header: '파일', value: (row) => row.file },
      { header: '줄', value: (row) => row.line },
      { header: '함수', value: (row) => row.name },
      { header: '길이', value: (row) => row.lines },
    ]),
    '',
    ...Object.entries(issueGroups).flatMap(([category, rows]) => [
      createSection(category, rows, issueColumns),
      '',
    ]),
    createSection('동일/유사 역할 파일 후보', duplicateCandidates, issueColumns),
    '',
    '## 해석 규칙',
    '',
    '- 이 리포트는 정적 휴리스틱이라 false positive가 있을 수 있습니다.',
    '- High 항목은 먼저 눈으로 확인하고, 기능 변경 없이 작은 단위로 분리하는 것을 권장합니다.',
    '- `ScrollView + map`, timer/subscription, Location/background task 항목은 Android 실기기 로그와 함께 확인하세요.',
    '- `services 밖 API 호출`은 frontend 기준입니다. backend smoke/scripts의 직접 fetch는 별도 CLI 용도로 허용될 수 있습니다.',
    '- generated report 자체는 스캔 대상에서 제외합니다.',
    '',
  ].join('\n');
}

function main() {
  const packageScripts = readPackageScripts();
  const filePaths = scanRoots.flatMap((scanRoot) => walkFiles(path.join(rootDir, scanRoot)));
  const metricsList = filePaths
    .map(getFileMetrics)
    .sort((left, right) => right.lineCount - left.lineCount);
  const codeMetricsList = metricsList.filter((metrics) => metrics.isCode);
  const bigFiles300 = metricsList.filter((metrics) => metrics.lineCount >= 300);
  const bigFiles500 = metricsList.filter((metrics) => metrics.lineCount >= 500);
  const functionCandidates = codeMetricsList
    .flatMap(findLargeFunctions)
    .sort((left, right) => right.lines - left.lines);

  const issueGroups = {
    'React component inline object/array/style 후보': metricsList.flatMap(findInlinePropIssues).sort(sortIssues),
    '렌더 중 sort/filter/map 후보': metricsList.flatMap(findRenderCalculationIssues).sort(sortIssues),
    'useEffect가 많은 파일': metricsList.flatMap(findEffectHeavyIssues).sort(sortIssues),
    'useMemo/useCallback 없이 props를 많이 만드는 후보': metricsList.flatMap(findPropsWithoutMemoIssues).sort(sortIssues),
    'services 밖 fetch/api 호출 후보': metricsList.flatMap(findServiceBoundaryIssues).sort(sortIssues),
    'utils/domain 밖 계산 로직 후보': metricsList.flatMap(findCalculationPlacementIssues).sort(sortIssues),
    'types 밖 타입 선언 후보': metricsList.flatMap(findTypePlacementIssues).sort(sortIssues),
    'setInterval/setTimeout/subscription cleanup 의심 후보': metricsList.flatMap(findCleanupIssues).sort(sortIssues),
    'Location/watchPosition/background task 사용 후보': metricsList.flatMap(findLocationIssues).sort(sortIssues),
  };
  const duplicateCandidates = findDuplicateFileCandidates(metricsList);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buildReport({
    bigFiles300,
    bigFiles500,
    duplicateCandidates,
    functionCandidates,
    issueGroups,
    metricsList,
    packageScripts,
  }));

  console.log('Code quality analysis complete.');
  console.log(`Generated: ${outputRelativePath}`);
  printTable('Summary', [
    { metric: 'Files', value: metricsList.length },
    { metric: 'Code files', value: codeMetricsList.length },
    { metric: '300+ line files', value: bigFiles300.length },
    { metric: '500+ line files', value: bigFiles500.length },
    { metric: '50+ line functions', value: functionCandidates.length },
    { metric: 'Duplicate/similar file candidates', value: duplicateCandidates.length },
  ], [
    { header: 'Metric', value: (row) => row.metric },
    { header: 'Value', value: (row) => row.value },
  ]);
  printTable('Top 300+ line files', bigFiles300.slice(0, 10), [
    { header: 'File', value: (row) => row.relativePath },
    { header: 'Lines', value: (row) => row.lineCount },
  ]);
  printTable('Issue counts', Object.entries(issueGroups).map(([category, rows]) => ({
    category,
    count: rows.length,
    high: rows.filter((issue) => issue.priority === 'High').length,
  })), [
    { header: 'Category', value: (row) => row.category },
    { header: 'Count', value: (row) => row.count },
    { header: 'High', value: (row) => row.high },
  ]);
}

export {
  findCalculationPlacementIssues,
  findLocationIssues,
  findTypePlacementIssues,
  isTypeBoundary,
  isUtilityBoundary,
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
