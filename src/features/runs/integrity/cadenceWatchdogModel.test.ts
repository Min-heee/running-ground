import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  advanceCadenceWatchdog,
  buildCadenceAudit,
  createCadenceWatchdogState,
  DEFAULT_CADENCE_WATCHDOG_CONFIG,
  paceLabelToSpeedMps,
  type CadenceWatchdogEvent,
  type CadenceWatchdogState,
  type CadenceWatchdogTick,
} from './cadenceWatchdogModel';

// 워치독은 1초 틱으로 돈다. 유예(15s)가 끝난 뒤부터 누적되므로 테스트는 유예를 먼저 소진.
const TICK_MS = 1000;
const GRACE_TICKS = DEFAULT_CADENCE_WATCHDOG_CONFIG.resumeGraceMs / TICK_MS + 1;

type Scenario = Partial<CadenceWatchdogTick> & { stepsPerSecond?: number };

function drive(
  state: CadenceWatchdogState,
  startMs: number,
  seconds: number,
  scenario: Scenario,
  startSteps = 0,
): { state: CadenceWatchdogState; events: CadenceWatchdogEvent[]; nowMs: number; steps: number } {
  const events: CadenceWatchdogEvent[] = [];
  let nowMs = startMs;
  let steps = startSteps;
  let current = state;

  for (let index = 0; index < seconds; index += 1) {
    nowMs += TICK_MS;
    steps += scenario.stepsPerSecond ?? 0;
    const result = advanceCadenceWatchdog(current, {
      nowMs,
      appActive: scenario.appActive ?? true,
      sensorReady: scenario.sensorReady ?? true,
      trackingRunning: scenario.trackingRunning ?? true,
      speedMps: scenario.speedMps === undefined ? 3.0 : scenario.speedMps,
      totalSteps: scenario.totalSteps === undefined ? steps : scenario.totalSteps,
    });
    current = result.state;
    if (result.event) {
      events.push(result.event);
    }
  }

  return { state: current, events, nowMs, steps };
}

function settled(): { state: CadenceWatchdogState; nowMs: number } {
  // 유예 소진: 정지 상태로 틱만 흘려 포그라운드 기준점을 잡는다.
  const { state, nowMs } = drive(createCadenceWatchdogState(), 0, GRACE_TICKS, { speedMps: 0 });
  return { state, nowMs };
}

test('paceLabelToSpeedMps: 페이스 라벨을 m/s로, 스테일 표기는 null', () => {
  assert.equal(paceLabelToSpeedMps('5:00/km'), 1000 / 300);
  assert.equal(Math.round((paceLabelToSpeedMps('1:51/km') ?? 0) * 100) / 100, 9.01);
  assert.equal(paceLabelToSpeedMps('--:--/km'), null);
  assert.equal(paceLabelToSpeedMps(undefined), null);
});

test('진짜 러너(160spm)는 창이 아무리 쌓여도 이벤트가 없다', () => {
  const start = settled();
  const run = drive(start.state, start.nowMs, 400, { stepsPerSecond: 160 / 60, speedMps: 3.2 });
  assert.deepEqual(run.events, []);
  assert.equal(run.state.strikes, 0);
  assert.equal(run.state.disqualified, false);
});

test('차량: 달리기 속도 이상인데 걸음 0 → 90초에 1차 경고, 180초에 실격', () => {
  const start = settled();
  const run = drive(start.state, start.nowMs, 200, { stepsPerSecond: 0, speedMps: 8.5 });
  assert.equal(run.events.length, 2);
  assert.equal(run.events[0]?.type, 'warning');
  assert.equal(run.events[1]?.type, 'disqualify');
  assert.equal(run.state.disqualified, true);
  // 실격 후엔 더 이상 아무 이벤트도 없다(멱등).
  const after = drive(run.state, run.nowMs, 200, { stepsPerSecond: 0, speedMps: 8.5 });
  assert.deepEqual(after.events, []);
});

test('걷기 속도·정지·속도 불명 구간은 창에 누적되지 않는다', () => {
  const start = settled();
  const walk = drive(start.state, start.nowMs, 300, { stepsPerSecond: 0, speedMps: 1.2 });
  assert.deepEqual(walk.events, []);
  assert.equal(walk.state.windowMovingMs, 0);
  const unknown = drive(walk.state, walk.nowMs, 300, { stepsPerSecond: 0, speedMps: null });
  assert.deepEqual(unknown.events, []);
  assert.equal(unknown.state.windowMovingMs, 0);
});

test('백그라운드/센서 부재/일시정지 틱은 누적하지 않고 복귀 후 유예를 다시 둔다', () => {
  const start = settled();
  // 백그라운드에서 300초 "차량 속도" — 안드로이드 화면 꺼짐 갤럭시 시나리오.
  const background = drive(start.state, start.nowMs, 300, { appActive: false, stepsPerSecond: 0, speedMps: 8.0 });
  assert.deepEqual(background.events, []);
  assert.equal(background.state.windowMovingMs, 0);
  assert.equal(background.state.foregroundSinceMs, null);

  // 복귀 직후 유예 안(15초)은 누적하지 않는다.
  const grace = drive(background.state, background.nowMs, 10, { stepsPerSecond: 0, speedMps: 8.0 });
  assert.equal(grace.state.windowMovingMs, 0);

  const noSensor = drive(start.state, start.nowMs, 300, { sensorReady: false, stepsPerSecond: 0, speedMps: 8.0 });
  assert.deepEqual(noSensor.events, []);
  const paused = drive(start.state, start.nowMs, 300, { trackingRunning: false, stepsPerSecond: 0, speedMps: 8.0 });
  assert.deepEqual(paused.events, []);
});

test('JS 수면 틈(틱 간격 > 5초)의 이동은 증거로 쓰지 않는다', () => {
  const start = settled();
  let state = start.state;
  let nowMs = start.nowMs;
  // 60초를 1초 틱으로 달리기 속도·걸음 0 → 창 60초.
  const first = drive(state, nowMs, 60, { stepsPerSecond: 0, speedMps: 8.0 });
  state = first.state;
  nowMs = first.nowMs;
  assert.equal(state.windowMovingMs, 60_000);
  // 40초 뒤 단일 틱: 잠들었던 틈 — 누적되면 100초로 창이 닫히며 경고가 났을 것.
  const woke = advanceCadenceWatchdog(state, {
    nowMs: nowMs + 40_000, appActive: true, sensorReady: true, trackingRunning: true, speedMps: 8.0, totalSteps: 0,
  });
  assert.equal(woke.event, null);
  assert.equal(woke.state.windowMovingMs, 60_000);
});

test('안드로이드 복귀 기준점 리셋(누적 걸음 감소)을 새 기준점 이후 걸음으로 해석한다', () => {
  const start = settled();
  const run = drive(start.state, start.nowMs, 30, { stepsPerSecond: 3, speedMps: 3.0 }, 800);
  // 누적 890 → 리셋으로 4로 떨어진 틱: 델타는 4(음수 아님).
  const reset = advanceCadenceWatchdog(run.state, {
    nowMs: run.nowMs + TICK_MS, appActive: true, sensorReady: true, trackingRunning: true, speedMps: 3.0, totalSteps: 4,
  });
  assert.equal(reset.state.windowSteps, run.state.windowSteps + 4);
});

test('깨끗한 창은 스트라이크를 하나 되돌린다 (잡음 관용) — 그래도 연속 두 창이면 실격', () => {
  const start = settled();
  const dirty = drive(start.state, start.nowMs, 95, { stepsPerSecond: 0, speedMps: 8.0 });
  assert.equal(dirty.state.strikes, 1);
  assert.equal(dirty.state.warningsIssued, 1);
  const clean = drive(dirty.state, dirty.nowMs, 95, { stepsPerSecond: 3, speedMps: 3.0 });
  assert.equal(clean.state.strikes, 0);
  assert.deepEqual(clean.events, []);
  // 깨끗한 구간의 잔여 걸음이 다음 창에 섞여 첫 더러운 창은 정확히 20spm(=문턱, 깨끗)으로
  // 닫힌다 — 그 뒤 두 창(180초)이 연속으로 더러워야 실격. 총 280초.
  const dirtyAgain = drive(clean.state, clean.nowMs, 280, { stepsPerSecond: 0, speedMps: 8.0 });
  assert.equal(dirtyAgain.events.at(-1)?.type, 'disqualify');
  // 경고 이벤트는 스트라이크마다 나오지만 카운터로 첫 경고만 Alert에 쓴다.
  assert.equal(dirtyAgain.state.warningsIssued, 2);
});

test('실격은 근제로 대역만: 30spm(유모차·거치대의 약한 접촉)은 멈추지 않고 집계에서만 빠진다', () => {
  const start = settled();
  // 30spm · 3.0 m/s → 보폭 6.0m. 사람 범위를 벗어나므로 집계 제외 대상이지만(오너 확정
  // 2026-09-10) 스트라이크는 쌓지 않고 달리기도 멈추지 않는다.
  const weakContact = drive(start.state, start.nowMs, 400, { stepsPerSecond: 0.5, speedMps: 3.0 });
  assert.deepEqual(weakContact.events.map((event) => event?.type), ['suspect']);
  assert.equal(weakContact.state.strikes, 0);
  assert.equal(weakContact.state.disqualified, false);
  assert.equal(weakContact.state.suspectedNonRunning, true);

  // 같은 30spm이라도 보폭이 사람 범위 안이면(느린 조깅 2.2 m/s → 4.4m는 아니고, 1.0 m/s는
  // 달리기 속도 미만) — 달리기 속도에서 사람 보폭을 지키려면 케이던스가 충분해야 한다.
  const realJog = drive(start.state, start.nowMs, 400, { stepsPerSecond: 2.5, speedMps: 3.0 });
  assert.deepEqual(realJog.events, []);
  assert.equal(realJog.state.suspectedNonRunning, false);

  // 반면 15spm(차량 진동 수준)은 여전히 실격이다.
  const vibration = drive(start.state, start.nowMs, 200, { stepsPerSecond: 0.25, speedMps: 6.0 });
  assert.equal(vibration.events.at(-1)?.type, 'disqualify');
});

test('감사 원장은 포그라운드 달리기 속도 이동만 센다', () => {
  const start = settled();
  const run = drive(start.state, start.nowMs, 120, { stepsPerSecond: 2, speedMps: 3.0 });
  const walk = drive(run.state, run.nowMs, 120, { stepsPerSecond: 2, speedMps: 1.0 }, run.steps);
  const audit = buildCadenceAudit(walk.state, true);
  assert.equal(audit.foregroundMovingSeconds, 120);
  assert.equal(audit.foregroundSteps, 240);
  assert.equal(audit.sensorAvailable, true);
  assert.equal(audit.disqualified, false);
});

// 오너 실측 (2026-09-10): 자전거 주행이 4:00/km(4.17 m/s)에서 75~81spm으로 찍혀 근제로(20spm)
// 문턱을 그대로 통과했다. 걸음은 찍히지만 그 걸음으로 갈 수 없는 거리 — 보폭 3.1m.
// 판정은 실격이 아니라 집계 제외다(오너 확정): 달리기를 멈추지 않고 런당 한 번만 알린다.
test('보폭 판정: 자전거(4:00/km · 80spm)는 실격이 아니라 집계 제외로 한 번만 걸린다', () => {
  const { state, nowMs } = settled();
  // 80spm = 초당 1.333걸음. 90초 창 → 120걸음, 이동 375m → 보폭 3.13m.
  const ride = drive(state, nowMs, 180, { speedMps: 4.17, stepsPerSecond: 80 / 60 });

  const suspects = ride.events.filter((event) => event?.type === 'suspect');
  assert.equal(suspects.length, 1, '런당 한 번');
  assert.equal(suspects[0]?.type === 'suspect' && suspects[0].windowSpm, 80);
  assert.equal(suspects[0]?.type === 'suspect' && suspects[0].strideMeters > 3, true);
  assert.equal(ride.events.some((event) => event?.type === 'warning' || event?.type === 'disqualify'), false, '실격 경로 아님');
  assert.equal(ride.state.disqualified, false);
  assert.equal(ride.state.strikes, 0);
  assert.equal(ride.state.suspectedNonRunning, true, '래치');

  // 원장에 실려 서버가 집계에서 뺀다.
  const audit = buildCadenceAudit(ride.state, true);
  assert.equal(audit.suspectedNonRunning, true);
  assert.equal(audit.disqualified, false);
  assert.equal(audit.foregroundMovingMeters > 700, true);
  assert.equal(audit.foregroundMovingMeters / audit.foregroundSteps > 3, true);
});

test('보폭 판정: 진짜 러너(4:00/km · 170spm)는 절대 걸리지 않는다', () => {
  const { state, nowMs } = settled();
  // 보폭 = 4.17 / (170/60) = 1.47m.
  const run = drive(state, nowMs, 200, { speedMps: 4.17, stepsPerSecond: 170 / 60 });

  assert.deepEqual(run.events, []);
  assert.equal(run.state.suspectedNonRunning, false);
  assert.equal(buildCadenceAudit(run.state, true).suspectedNonRunning, false);

  // 3:00/km를 180spm으로 뛰는 최상급(보폭 1.85m)도 마찬가지.
  const elite = drive(settled().state, nowMs, 200, { speedMps: 5.56, stepsPerSecond: 180 / 60 });
  assert.deepEqual(elite.events, []);
  assert.equal(elite.state.suspectedNonRunning, false);
});

test('보폭 판정은 근제로 실격 경로를 건드리지 않는다 — 거치된 폰은 예전 그대로 2창에 실격', () => {
  const { state, nowMs } = settled();
  const mounted = drive(state, nowMs, 200, { speedMps: 4.17, stepsPerSecond: 5 / 60 });

  assert.equal(mounted.events.some((event) => event?.type === 'warning'), true);
  assert.equal(mounted.state.disqualified, true);
  assert.equal(mounted.events.some((event) => event?.type === 'suspect'), false, '근제로는 실격이지 집계 제외가 아니다');
});

// 보폭 판정은 실격 거동을 절대 바꾸지 않는다: 걸음이 찍힌 창은 보폭과 무관하게 스트라이크를
// 하나 되돌린다. 안 그러면 '근제로 → 보폭 → 근제로'가 예전엔 없던 실격을 만든다.
test('보폭 창도 스트라이크를 되돌린다 — 예전엔 없던 실격이 생기지 않는다', () => {
  const start = settled();
  // 창1: 근제로(5spm) → 스트라이크 1.
  const dirty = drive(start.state, start.nowMs, 95, { speedMps: 4.17, stepsPerSecond: 5 / 60 });
  assert.equal(dirty.state.strikes, 1);
  assert.equal(dirty.state.disqualified, false);

  // 창2: 걸음은 찍히지만 보폭 초과(80spm · 4.17 m/s) → 집계 제외 표시 + 스트라이크 회복.
  const suspect = drive(dirty.state, dirty.nowMs, 95, { speedMps: 4.17, stepsPerSecond: 80 / 60 }, dirty.steps);
  assert.equal(suspect.events.filter((event) => event?.type === 'suspect').length, 1);
  assert.equal(suspect.state.strikes, 0, '보폭 창도 스트라이크를 되돌린다');
  assert.equal(suspect.state.suspectedNonRunning, true);

  // 창3: 다시 근제로 → 스트라이크 1(실격 아님). 회복이 없었다면 여기서 실격이었다.
  const dirtyAgain = drive(suspect.state, suspect.nowMs, 95, { speedMps: 4.17, stepsPerSecond: 5 / 60 }, suspect.steps);
  assert.equal(dirtyAgain.state.strikes, 1);
  assert.equal(dirtyAgain.state.disqualified, false);
});
