import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function hasFlag(flagName) {
  return process.argv.includes(flagName);
}

function readArgValue(flagName) {
  const index = process.argv.indexOf(flagName);

  if (index < 0 || index + 1 >= process.argv.length) {
    return '';
  }

  return process.argv[index + 1]?.trim() ?? '';
}

function usage() {
  return `
Usage:
  npm run testflight:qa:report
  npm run testflight:qa:report -- --build-label 1.0.0\(15\) --device "iPhone 16 Pro"
  npm run testflight:qa:report -- --output ./docs/qa-sessions/today.md --overwrite

Options:
  --build-label <label>  Optional TestFlight build label shown in the report.
  --device <name>        Optional device name shown in the report.
  --tester <name>        Optional tester name shown in the report.
  --output <path>        Markdown output path. Defaults to docs/qa-sessions/testflight-qa-YYYYMMDD-HHmm.md
  --api-base-url <url>   Forwarded to preview:smoke.
  --admin-token <token>  Forwarded to preview:smoke.
  --username <value>     Forwarded to preview:smoke.
  --password <value>     Forwarded to preview:smoke.
  --require-admin        Require admin status in preview:smoke.
  --overwrite            Overwrite output if it already exists.
  --help                 Show this message.
`.trim();
}

function fail(message) {
  console.error(`[testflight-qa-report] ${message}`);
  process.exit(1);
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatTimestampParts(date) {
  return {
    year: String(date.getFullYear()),
    month: pad(date.getMonth() + 1),
    day: pad(date.getDate()),
    hour: pad(date.getHours()),
    minute: pad(date.getMinutes()),
  };
}

function formatHumanTimestamp(date) {
  const { year, month, day, hour, minute } = formatTimestampParts(date);
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function buildDefaultOutputPath(projectRoot, date) {
  const { year, month, day, hour, minute } = formatTimestampParts(date);
  return resolve(projectRoot, 'docs', 'qa-sessions', `testflight-qa-${year}${month}${day}-${hour}${minute}.md`);
}

function buildSmokeArgs(projectRoot) {
  const scriptPath = resolve(projectRoot, 'scripts', 'check-preview-public-api.mjs');
  const args = [scriptPath, '--json'];

  for (const flagName of ['--api-base-url', '--admin-token', '--username', '--password']) {
    const value = readArgValue(flagName);

    if (value) {
      args.push(flagName, value);
    }
  }

  if (hasFlag('--require-admin')) {
    args.push('--require-admin');
  }

  return args;
}

function runPreviewSmoke(projectRoot) {
  const smokeArgs = buildSmokeArgs(projectRoot);
  const result = spawnSync(process.execPath, smokeArgs, {
    cwd: projectRoot,
    encoding: 'utf8',
    env: process.env,
  });

  if (result.error) {
    return {
      ok: false,
      exitCode: 1,
      command: [process.execPath, ...smokeArgs].join(' '),
      summary: {
        ok: false,
        error: result.error.message,
      },
      stderr: result.stderr ?? '',
    };
  }

  const stdout = String(result.stdout ?? '').trim();
  let summary = null;

  if (stdout) {
    try {
      summary = JSON.parse(stdout);
    } catch {
      summary = {
        ok: false,
        error: 'preview:smoke JSON output could not be parsed.',
        rawStdout: stdout,
      };
    }
  }

  if (!summary) {
    summary = {
      ok: false,
      error: 'preview:smoke did not return JSON output.',
    };
  }

  return {
    ok: result.status === 0 && summary.ok === true,
    exitCode: result.status ?? 1,
    command: [process.execPath, ...smokeArgs].join(' '),
    summary,
    stderr: String(result.stderr ?? '').trim(),
  };
}

function formatCheck(checked) {
  return checked ? '[x]' : '[ ]';
}

function formatValue(value, fallback = '-') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function formatReportPath(projectRoot, outputPath) {
  const relativePath = relative(projectRoot, outputPath);

  if (!relativePath || relativePath.startsWith('..')) {
    return outputPath;
  }

  return relativePath;
}

function buildCountsLines(summary) {
  const counts = summary?.counts ?? {};

  return [
    `- 친구 랭킹 항목 수: ${counts.leaderboardRanks ?? 0}`,
    `- 지역 하위 노드 수: ${counts.regionChildren ?? 0}`,
    `- 대학 랭킹 항목 수: ${counts.universityRanks ?? 0}`,
    `- 마켓 상품 수: ${counts.marketItems ?? 0}`,
    `- 레이스 이벤트 수: ${counts.upcomingRaces ?? 0}`,
    `- 연동 소스 수: ${counts.integrationSources ?? 0}`,
  ].join('\n');
}

function buildSmokeStatusBlock(smokeResult) {
  const summary = smokeResult.summary ?? {};
  const admin = summary.admin ?? {};
  const auth = summary.auth ?? {};

  return [
    `- preview:smoke 결과: ${summary.ok ? 'PASS' : 'FAIL'}`,
    `- preview API: ${formatValue(summary.apiBaseUrl)}`,
    `- public base URL: ${formatValue(summary.publicBaseUrl)}`,
    `- environment: ${formatValue(summary.environment)}`,
    `- smoke user: ${formatValue(auth.username)}`,
    `- smoke user 생성 여부: ${auth.created ? '이번 실행에서 생성됨' : '기존 계정 로그인'}`,
    `- latest run id: ${formatValue(summary.latestRunId)}`,
    `- admin status: ${admin.checked ? (admin.ok ? 'PASS' : 'FAIL') : 'SKIPPED'}`,
    `- admin counts: users=${admin.users ?? '-'}, runs=${admin.runs ?? '-'}`,
    buildCountsLines(summary),
    summary.ok ? '' : `- smoke error: ${formatValue(summary.error)}`,
  ].filter(Boolean).join('\n');
}

function buildMarkdown({
  generatedAt,
  buildLabel,
  device,
  tester,
  outputPath,
  projectRoot,
  smokeResult,
}) {
  const smokeSummary = smokeResult.summary ?? {};
  const reportPath = formatReportPath(projectRoot, outputPath);
  const generatedLabel = formatHumanTimestamp(generatedAt);

  return `
# TestFlight QA Session Report

## 기본 정보
- 생성 시각: ${generatedLabel}
- TestFlight build: ${formatValue(buildLabel)}
- 기기: ${formatValue(device)}
- 테스터: ${formatValue(tester)}
- 리포트 경로: ${reportPath}

## 자동 수집된 preview 상태
${buildSmokeStatusBlock(smokeResult)}

## 사전 점검 체크
- ${formatCheck(smokeSummary.ok === true)} \`npm run preview:smoke\`
- ${formatCheck(Boolean((smokeSummary.admin ?? {}).checked && (smokeSummary.admin ?? {}).ok))} 관리자 상태 확인
- [ ] \`scripts\\windows\\status-preview-public-backend.cmd -RunPublicSmoke -RequireHealthy -RequireSmokeHealthy\`
- [ ] TestFlight 최신 빌드 설치 확인

## 1차 게이트
### 앱 열기와 로그인
- [ ] 앱 실행 직후 흰 화면/무한 로딩이 없다
- [ ] 기존 계정 로그인 성공
- [ ] 로그인 후 홈 진입 성공
- [ ] 앱 재실행 후 세션 유지 확인

### 신규 회원가입
- [ ] 아이디 중복 확인 동작
- [ ] 신규 회원가입 성공
- [ ] 회원가입 후 홈 진입 성공
- [ ] 뒤로 가기 또는 탭 이동에 갇히지 않음

## 2차 게이트
### 홈과 탭 이동
- [ ] 홈 헤더/주요 카드 정상 표시
- [ ] 우리 지역 배틀 카드 정상 표시
- [ ] 친구 랭킹 카드 정상 표시
- [ ] 홈에서 이동한 화면이 상단부터 표시
- [ ] 리그/친구/홈/레이스/마켓/마이 탭 이동 정상

## 3차 게이트
### 친구/리그
- [ ] 친구 랭킹 목록 정상
- [ ] 친구 상세 진입 후 정상 복귀
- [ ] 친구 활동/기록 화면에서 갇히지 않음
- [ ] 지역 리그 drill-down 정상
- [ ] 대학 리그 빈 상태에서도 화면 비정상 없음

### 마켓/레이스
- [ ] 마켓 상품 목록/포인트/재고 정상 표시
- [ ] 레이스 날짜별 목록 정상 표시
- [ ] 시간대/거리별 구조가 깨지지 않음

## 4차 게이트
### 기록 흐름
- [ ] 내 활동 목록 정상
- [ ] 러닝 상세 진입 후 정상 복귀
- [ ] 기록 source 표기 확인
- [ ] 기록 가져오기 또는 동기화 성공
- [ ] 이미 가져온 기록만 있을 때 중복 생성 없이 안내 표시
- [ ] 새 기록 반영 후 홈/내 활동/최신 기록 업데이트 확인

## 5차 게이트
### 매칭 흐름
- [ ] 1대1 테스트 매칭이 바로 시작 흐름으로 이어짐
- [ ] 그룹 테스트 매칭이 바로 시작 흐름으로 이어짐
- [ ] 예약 1대1 매칭 생성 성공
- [ ] 예약 그룹 매칭 생성 성공
- [ ] 시작 10분 전 카운트다운 표시 확인
- [ ] 시작 30초 전 오버레이 확인
- [ ] 대결 시작 후 \`대결 보기 / 순위 보기 / 기록 보기\` 확인
- [ ] 대결 종료 후 결과 저장 확인
- [ ] \`테스트 대결 그만\` 동작 확인

## 재현 메모
- 

## 실패/수정 필요 사항
- 

## 최종 판정
- [ ] 실기기 QA 1차 통과
- [ ] 수정 후 재검증 필요

## 원본 smoke 명령
\`\`\`bash
${smokeResult.command}
\`\`\`

## raw smoke JSON
\`\`\`json
${JSON.stringify(smokeSummary, null, 2)}
\`\`\`
`.trimStart();
}

function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.log(usage());
    return;
  }

  const generatedAt = new Date();
  const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const outputPath = resolve(
    projectRoot,
    readArgValue('--output') || buildDefaultOutputPath(projectRoot, generatedAt),
  );
  const overwrite = hasFlag('--overwrite');

  const smokeResult = runPreviewSmoke(projectRoot);
  const markdown = buildMarkdown({
    generatedAt,
    buildLabel: readArgValue('--build-label'),
    device: readArgValue('--device'),
    tester: readArgValue('--tester'),
    outputPath,
    projectRoot,
    smokeResult,
  });

  mkdirSync(dirname(outputPath), { recursive: true });

  if (!overwrite) {
    try {
      writeFileSync(outputPath, markdown, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      fail(`output already exists or could not be written: ${error.message}`);
    }
  } else {
    writeFileSync(outputPath, markdown, 'utf8');
  }

  console.log(`[testflight-qa-report] wrote ${formatReportPath(projectRoot, outputPath)}`);

  if (!smokeResult.ok) {
    console.error('[testflight-qa-report] preview smoke failed. report was still written with failure details.');
    process.exitCode = 1;
  }
}

main();
