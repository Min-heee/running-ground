import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import {
  resetNativeDistanceAccumulatorForTest,
  setGapRuleBinarySupport,
  setNativeDistanceAccumulatorModuleForTest,
  startNativeDistanceAccumulator,
} from './distanceAccumulatorController';
import { MAX_CREDITABLE_FIX_GAP_MS } from './locationDistance';
import { resolveNativeGapRuleBinary, NATIVE_GAP_RULE_MIN_BUILD } from './nativeGapRuleSupport';
import {
  getAccumulatedDistanceMeters,
  getExternalCreditMeters,
  getPreWakeFixFloorMs,
  resetRouteAccumulator,
  setAccumulatedDistanceMeters,
  sumObservedRouteDistanceMeters,
} from './routeAccumulator';
import {
  captureScreenOffGapOnWake,
  getScreenOffGapCaptureForTest,
  MIN_CREDIT_METERS,
  MIN_STALE_GAP_MS,
  reconcileScreenOffGapAfterFixesAppended,
  resetScreenOffGapReconcileForTest,
  settlePendingScreenOffGapNow,
} from './screenOffGapReconcile';
import { recordBackgroundSnapshotUpdate } from './backgroundSyncDiagnostics';
import { getSnapshotState, setSnapshotState, INITIAL_SNAPSHOT } from './snapshotStore';

// 화면꺼짐 갭 정산의 계약. 틀리는 방향은 둘뿐이고 둘 다 실사고다:
// 덜 주면 기록이 짧아지고(회원F 2026-08-17), 더 주면 부정 적립이다.

const STARTED_AT = '2026-08-17T09:00:00.000Z';

function fakeNative(initialMeters: number) {
  const state = { meters: initialMeters };
  return {
    state,
    module: {
      isNativeDistanceAccumulatorAvailable: () => true,
      startDistanceAccumulator: () => true,
      seedDistanceAccumulator: () => undefined,
      getAccumulatedDistanceMeters: () => state.meters,
      resetDistanceAccumulator: () => undefined,
      stopDistanceAccumulator: () => undefined,
    },
  };
}

async function armRunningRun({ jsMeters, nativeMeters }: { jsMeters: number; nativeMeters: number }) {
  const fake = fakeNative(nativeMeters);
  setNativeDistanceAccumulatorModuleForTest(fake.module);
  await startNativeDistanceAccumulator('match-1', jsMeters);
  setGapRuleBinarySupport(true);
  setAccumulatedDistanceMeters(jsMeters);
  setSnapshotState({
    ...INITIAL_SNAPSHOT,
    status: 'running',
    startedAt: STARTED_AT,
    distanceKm: jsMeters / 1000,
  });
  // 신선도 시계를 지금 시각으로 무장 — 각 테스트는 nowMs를 미래로 밀어 갭을 만든다.
  recordBackgroundSnapshotUpdate(true);
  return fake;
}

beforeEach(() => {
  resetScreenOffGapReconcileForTest();
  resetNativeDistanceAccumulatorForTest();
  resetRouteAccumulator();
  setSnapshotState({ ...INITIAL_SNAPSHOT });
  setNativeDistanceAccumulatorModuleForTest(undefined);
});

test('잠든 사이 네이티브가 앞선 만큼이 첫 픽스 반영 뒤 JS 원장에 들어온다', async () => {
  await armRunningRun({ jsMeters: 3050, nativeMeters: 4020 });
  const wakeAt = Date.now() + 120_000;

  assert.equal(captureScreenOffGapOnWake({ nowMs: wakeAt, quietWakeDelayMs: 60_000 }), true);
  assert.ok(getScreenOffGapCaptureForTest());

  // 신선한 픽스 몇 개가 반영돼 JS가 6m 전진한 뒤 정산이 확정된다.
  setAccumulatedDistanceMeters(3056);
  reconcileScreenOffGapAfterFixesAppended();

  assert.equal(getScreenOffGapCaptureForTest(), null);
  // 크레딧 = 포획한 네이티브(4020) − 지금의 JS(3056) = 964 → 총거리는 정확히 4020.
  assert.ok(Math.abs(getAccumulatedDistanceMeters() - 4020) < 1e-6, `원장이 ${getAccumulatedDistanceMeters()}m`);
  assert.ok(Math.abs(getExternalCreditMeters() - 964) < 1e-6);
  // 스냅샷도 새 총거리를 실었다 — 저장 경로가 읽는 값이 바로 이것이다.
  assert.ok(Math.abs(getSnapshotState().distanceKm - 4.02) < 1e-9);
});

test('OS가 밀린 픽스를 재생해 JS가 스스로 따라잡은 만큼은 자동으로 차감된다 — 이중 적립 불가', async () => {
  await armRunningRun({ jsMeters: 3050, nativeMeters: 4020 });
  const wakeAt = Date.now() + 120_000;
  captureScreenOffGapOnWake({ nowMs: wakeAt, quietWakeDelayMs: 60_000 });

  // 재생이 갭 대부분을 되찾았다: JS가 3900까지 자력 회복.
  setAccumulatedDistanceMeters(3900);
  reconcileScreenOffGapAfterFixesAppended();

  // 크레딧 = 4020 − 3900 = 120 — 총거리는 재생 여부와 무관하게 포획한 네이티브 값.
  assert.ok(Math.abs(getAccumulatedDistanceMeters() - 4020) < 1e-6);
  assert.ok(Math.abs(getExternalCreditMeters() - 120) < 1e-6);
});

test('JS가 거의 다 따라잡았으면 지터 바닥 미만이라 크레딧을 주지 않는다', async () => {
  await armRunningRun({ jsMeters: 3050, nativeMeters: 4020 });
  const wakeAt = Date.now() + 120_000;
  captureScreenOffGapOnWake({ nowMs: wakeAt, quietWakeDelayMs: 60_000 });

  setAccumulatedDistanceMeters(3990);
  reconcileScreenOffGapAfterFixesAppended();

  assert.equal(getScreenOffGapCaptureForTest(), null);
  assert.equal(getAccumulatedDistanceMeters(), 3990);
  assert.equal(getExternalCreditMeters(), 0);
});

test('크레딧은 잠든 시간에 사람이 달릴 수 있는 상한을 넘지 못한다', async () => {
  // 60초 잠들었는데 네이티브가 2km 앞서 있다고 주장 — 상한(60s×8.5m/s=510m)으로 자른다.
  await armRunningRun({ jsMeters: 1000, nativeMeters: 3000 });
  const wakeAt = Date.now() + 60_000;
  captureScreenOffGapOnWake({ nowMs: wakeAt, quietWakeDelayMs: 60_000 });
  reconcileScreenOffGapAfterFixesAppended();

  assert.ok(Math.abs(getExternalCreditMeters() - 510) < 1);
});

test('신호 끊김 문턱보다 짧은 공백은 정산 대상이 아니다 — 라이브 필터가 직선을 직접 적립한다', async () => {
  await armRunningRun({ jsMeters: 3050, nativeMeters: 4020 });

  // 30초 미만 공백의 직선은 isSignalLossGapMs 미만이라 정상 주행으로 적립된다. 거기에
  // 크레딧까지 주면 같은 구간이 두 번 적립되므로, 포획 문턱은 반드시 그 위여야 한다.
  assert.ok(MIN_STALE_GAP_MS > MAX_CREDITABLE_FIX_GAP_MS);
  assert.equal(captureScreenOffGapOnWake({ nowMs: Date.now() + MAX_CREDITABLE_FIX_GAP_MS }), false);
});

test('갭 규칙 없는 바이너리·안 뛰는 상태·작은 차이에서는 포획하지 않는다', async () => {
  await armRunningRun({ jsMeters: 3050, nativeMeters: 4020 });

  setGapRuleBinarySupport(false);
  assert.equal(captureScreenOffGapOnWake({ nowMs: Date.now() + 120_000 }), false);
  setGapRuleBinarySupport(true);

  // 차이가 지터 수준.
  resetNativeDistanceAccumulatorForTest();
  const fake = fakeNative(3050 + MIN_CREDIT_METERS - 5);
  setNativeDistanceAccumulatorModuleForTest(fake.module);
  await startNativeDistanceAccumulator('match-1', 3050);
  setGapRuleBinarySupport(true);
  assert.equal(captureScreenOffGapOnWake({ nowMs: Date.now() + 120_000 }), false);

  // 런이 안 돌고 있다.
  setSnapshotState({ ...getSnapshotState(), status: 'idle' });
  assert.equal(captureScreenOffGapOnWake({ nowMs: Date.now() + 120_000 }), false);
});

test('일시정지된 같은 런에는 정산한다 — 깨어나자마자 종료를 누르는 것이 사고의 흐름이다', async () => {
  await armRunningRun({ jsMeters: 3050, nativeMeters: 4020 });
  const wakeAt = Date.now() + 120_000;
  captureScreenOffGapOnWake({ nowMs: wakeAt, quietWakeDelayMs: 60_000 });

  // 저장 직전: 트래커가 일시정지로 넘어갔다. startedAt은 그대로다.
  setSnapshotState({ ...getSnapshotState(), status: 'paused' });
  settlePendingScreenOffGapNow();

  assert.ok(Math.abs(getAccumulatedDistanceMeters() - 4020) < 1e-6);
});

test('정산 전에 런이 바뀌면 남의 런에 이관하지 않는다', async () => {
  await armRunningRun({ jsMeters: 3050, nativeMeters: 4020 });
  const wakeAt = Date.now() + 120_000;
  captureScreenOffGapOnWake({ nowMs: wakeAt, quietWakeDelayMs: 60_000 });

  setSnapshotState({ ...getSnapshotState(), startedAt: '2026-08-17T10:00:00.000Z', distanceKm: 0 });
  setAccumulatedDistanceMeters(0);
  reconcileScreenOffGapAfterFixesAppended();

  assert.equal(getAccumulatedDistanceMeters(), 0);
  assert.equal(getExternalCreditMeters(), 0);
});

test('두 번째 깨어남(Face ID·배너)이 와도 대기 중인 포획은 버려지지 않고 먼저 정산된다', async () => {
  await armRunningRun({ jsMeters: 3050, nativeMeters: 4020 });
  const wakeAt = Date.now() + 120_000;
  captureScreenOffGapOnWake({ nowMs: wakeAt, quietWakeDelayMs: 60_000 });

  // 몇 초 뒤 'active'가 또 온다. 네이티브는 이미 꺼져 0을 준다 — 새 포획은 없어야 하고,
  // 이전 포획은 폐기가 아니라 정산돼야 한다.
  resetNativeDistanceAccumulatorForTest();
  setGapRuleBinarySupport(true);
  captureScreenOffGapOnWake({ nowMs: wakeAt + 3_000 });

  assert.ok(Math.abs(getAccumulatedDistanceMeters() - 4020) < 1e-6, `원장이 ${getAccumulatedDistanceMeters()}m`);
  assert.equal(getScreenOffGapCaptureForTest(), null);
});

test('GPS가 영영 안 오면 타이머가 정산한다 — 실내에서 런을 끝내는 경우', async () => {
  await armRunningRun({ jsMeters: 3050, nativeMeters: 4020 });
  const wakeAt = Date.now() + 120_000;
  captureScreenOffGapOnWake({ nowMs: wakeAt, quietWakeDelayMs: 20 });

  await new Promise((resolve) => { setTimeout(resolve, 60); });

  assert.equal(getScreenOffGapCaptureForTest(), null);
  assert.ok(Math.abs(getAccumulatedDistanceMeters() - 4020) < 1e-6);
});

test('정산이 확정되면 깨어난 시각 이전의 픽스는 원장에 못 들어온다 — 수면 꼬리 이중 적립 봉쇄', async () => {
  // 크레딧은 네이티브가 깨어난 순간까지 센 총거리를 보상한다. 그 뒤에 도착하는, 깨어나기
  // 전 시각이 찍힌 픽스(나이 필터 15초를 통과하는 수면 꼬리)가 또 적립되면 같은 구간이 두 번
  // 세어진다 — 재검증이 잡은 마지막 경로. 정산이 바닥 시각을 놓아 그 픽스들을 차단한다.
  await armRunningRun({ jsMeters: 3050, nativeMeters: 4020 });
  const wakeAt = Date.now() + 120_000;
  captureScreenOffGapOnWake({ nowMs: wakeAt, quietWakeDelayMs: 60_000 });

  assert.equal(getPreWakeFixFloorMs(), null);
  reconcileScreenOffGapAfterFixesAppended();

  assert.equal(getPreWakeFixFloorMs(), wakeAt);

  // 새 런이 시작되면 바닥도 사라진다.
  resetRouteAccumulator();
  assert.equal(getPreWakeFixFloorMs(), null);
});

test('경로 재계산은 신호 끊김 직선을 합산하지 않는다 — 크레딧과의 이중 적립 봉쇄', () => {
  const at = (offsetMs: number) => new Date(Date.parse(STARTED_AT) + offsetMs).toISOString();
  // 대략 111m ≈ 위도 0.001도. 관측 구간은 실제 픽스 간격(십수 초), 가운데만 5분 공백
  // (잠든 구간의 직선 ~1.1km).
  const route = [
    { latitude: 37, longitude: 127, timestamp: at(0) },
    { latitude: 37.001, longitude: 127, timestamp: at(20_000) },
    { latitude: 37.011, longitude: 127, timestamp: at(320_000) },
    { latitude: 37.012, longitude: 127, timestamp: at(340_000) },
  ];

  const observed = sumObservedRouteDistanceMeters(route);
  // 1번째와 4번째 구간만 관측(각 ~111m) — 잠든 직선(~1.1km)은 빠진다.
  assert.ok(observed > 200 && observed < 250, `${observed}m`);
});

test('바이너리 판별: 갭 규칙 최소 빌드 미만·판독 불가는 전부 닫힌다', () => {
  assert.equal(resolveNativeGapRuleBinary('ios', NATIVE_GAP_RULE_MIN_BUILD.ios), true);
  assert.equal(resolveNativeGapRuleBinary('ios', String(NATIVE_GAP_RULE_MIN_BUILD.ios)), true);
  assert.equal(resolveNativeGapRuleBinary('ios', NATIVE_GAP_RULE_MIN_BUILD.ios - 1), false);
  assert.equal(resolveNativeGapRuleBinary('android', NATIVE_GAP_RULE_MIN_BUILD.android), true);
  assert.equal(resolveNativeGapRuleBinary('android', NATIVE_GAP_RULE_MIN_BUILD.android - 1), false);
  assert.equal(resolveNativeGapRuleBinary('android', '45'), true);
  assert.equal(resolveNativeGapRuleBinary('web', 999), false);
  assert.equal(resolveNativeGapRuleBinary('ios', null), false);
  assert.equal(resolveNativeGapRuleBinary('ios', undefined), false);
  assert.equal(resolveNativeGapRuleBinary('ios', 'abc'), false);
  assert.equal(resolveNativeGapRuleBinary('ios', 0), false);
});
