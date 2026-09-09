import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildCadenceWarningTitle,
  buildCadenceWatchdogPresentation,
  buildCadenceWatchdogTick,
  CADENCE_DISQUALIFY_MATCH_BODY,
  CADENCE_DISQUALIFY_MATCH_SPEECH,
  CADENCE_DISQUALIFY_SOLO_BODY,
  CADENCE_DISQUALIFY_SOLO_SPEECH,
  CADENCE_DISQUALIFY_TITLE,
  CADENCE_WARNING_BODY,
  resolveCadenceDisqualifyAction,
} from './cadenceWatchdogActions';

test('tick builder: 포그라운드 + 센서 생존 + running + 측정된 페이스만 활성 틱이 된다', () => {
  const tick = buildCadenceWatchdogTick({
    nowMs: 1_000,
    appState: 'active',
    sensor: { active: true },
    trackingStatus: 'running',
    currentPace: '5:00/km',
    totalSteps: 120,
  });

  assert.equal(tick.nowMs, 1_000);
  assert.equal(tick.appActive, true);
  assert.equal(tick.sensorReady, true);
  assert.equal(tick.trackingRunning, true);
  assert.equal(tick.speedMps, 1000 / 300);
  assert.equal(tick.totalSteps, 120);
});

test('tick builder: 백그라운드/센서 부재/일시정지/스테일 페이스/걸음 부재는 각각 비활성 값으로 내려간다', () => {
  const tick = buildCadenceWatchdogTick({
    nowMs: 2_000,
    appState: 'background',
    sensor: { active: false },
    trackingStatus: 'paused',
    currentPace: '--:--/km',
    totalSteps: null,
  });

  assert.equal(tick.appActive, false);
  assert.equal(tick.sensorReady, false);
  assert.equal(tick.trackingRunning, false);
  assert.equal(tick.speedMps, null);
  assert.equal(tick.totalSteps, null);

  // NaN 걸음도 null — 델타 계산에 오염되지 않게.
  assert.equal(buildCadenceWatchdogTick({
    nowMs: 3_000,
    appState: 'active',
    sensor: { active: true },
    trackingStatus: 'running',
    currentPace: '5:00/km',
    totalSteps: Number.NaN,
  }).totalSteps, null);
});

test('실격 액션: 매치(공식·파티런 duel/group)는 실격 기권, 그 외(솔로·경찰과 도둑런·방)는 기록 폐기', () => {
  assert.deepEqual(resolveCadenceDisqualifyAction('duel'), { kind: 'forfeit', source: 'duel' });
  assert.deepEqual(resolveCadenceDisqualifyAction('group'), { kind: 'forfeit', source: 'group' });
  assert.deepEqual(resolveCadenceDisqualifyAction('solo'), { kind: 'discard' });
  assert.deepEqual(resolveCadenceDisqualifyAction('chase'), { kind: 'discard' });
  assert.deepEqual(resolveCadenceDisqualifyAction('room'), { kind: 'discard' });
});

test('경고 문구: 제목은 (n/2), 본문·음성은 오너 확정 카피 그대로', () => {
  assert.equal(buildCadenceWarningTitle(1), '케이던스 경고 (1/2)');
  assert.equal(CADENCE_WARNING_BODY, '케이던스가 잡히지 않아요. 폰을 몸에 지니거나 손에 들어주세요 — 달리는 중이 아니면 부정 러닝으로 실격 처리돼요.');

  const presentation = buildCadenceWatchdogPresentation(
    { type: 'warning', strike: 1, windowSpm: 12 },
    { kind: 'discard' },
  );
  assert.deepEqual(presentation, {
    title: '케이던스 경고 (1/2)',
    body: CADENCE_WARNING_BODY,
    speech: CADENCE_WARNING_BODY,
  });
});

test('실격 문구: 솔로는 기록 미저장 카피, 매치는 실격패 카피', () => {
  assert.equal(CADENCE_DISQUALIFY_TITLE, '부정 러닝 판정');
  assert.equal(
    CADENCE_DISQUALIFY_SOLO_BODY,
    '달리기 속도로 이동했지만 케이던스가 두 번 연속 감지되지 않았어요. 부정 러닝으로 판정돼 이 기록은 저장되지 않아요.',
  );

  const solo = buildCadenceWatchdogPresentation(
    { type: 'disqualify', strikes: 2, windowSpm: 0 },
    { kind: 'discard' },
  );
  assert.deepEqual(solo, {
    title: CADENCE_DISQUALIFY_TITLE,
    body: CADENCE_DISQUALIFY_SOLO_BODY,
    speech: CADENCE_DISQUALIFY_SOLO_SPEECH,
  });

  const match = buildCadenceWatchdogPresentation(
    { type: 'disqualify', strikes: 2, windowSpm: 0 },
    { kind: 'forfeit', source: 'duel' },
  );
  assert.deepEqual(match, {
    title: CADENCE_DISQUALIFY_TITLE,
    body: CADENCE_DISQUALIFY_MATCH_BODY,
    speech: CADENCE_DISQUALIFY_MATCH_SPEECH,
  });
  assert.match(match.body, /실격패/);
});

test('tick builder: 신선한 원시 GPS 속도가 있으면 페이스 라벨보다 우선한다 (트래커가 픽스를 거부해도 차량은 보인다)', () => {
  // 오너 실기기 영상: 시속 30km 초과 → 트래커 거부 → 페이스 '--:--/km' — 원시 속도로 이동 중 판정.
  const rejectedByTracker = buildCadenceWatchdogTick({
    nowMs: 3_000,
    appState: 'active',
    sensor: { active: true },
    trackingStatus: 'running',
    currentPace: '--:--/km',
    rawFixSpeedMps: 12.5,
    totalSteps: 0,
  });
  assert.equal(rejectedByTracker.speedMps, 12.5);

  // 원시 속도가 낡아 null이면 페이스 라벨로 폴백.
  const paceFallback = buildCadenceWatchdogTick({
    nowMs: 4_000,
    appState: 'active',
    sensor: { active: true },
    trackingStatus: 'running',
    currentPace: '5:00/km',
    rawFixSpeedMps: null,
    totalSteps: 10,
  });
  assert.equal(paceFallback.speedMps, 1000 / 300);
});
