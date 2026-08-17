import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import {
  resetNativeDistanceAccumulatorForTest,
  setGapRuleBinarySupport,
  setNativeDistanceAccumulatorModuleForTest,
  startNativeDistanceAccumulator,
} from './distanceAccumulatorController';
import { resolveNativeGapRuleBinary, NATIVE_GAP_RULE_MIN_BUILD } from './nativeGapRuleSupport';
import {
  getAccumulatedDistanceMeters,
  getExternalCreditMeters,
  resetRouteAccumulator,
  setAccumulatedDistanceMeters,
} from './routeAccumulator';
import {
  captureScreenOffGapOnWake,
  getScreenOffGapCaptureForTest,
  MIN_CREDIT_METERS,
  MIN_STALE_GAP_MS,
  reconcileScreenOffGapFromBatch,
  resetScreenOffGapReconcileForTest,
} from './screenOffGapReconcile';
import { recordBackgroundSnapshotUpdate } from './backgroundSyncDiagnostics';
import { getSnapshotState, setSnapshotState, INITIAL_SNAPSHOT } from './snapshotStore';

// 화면꺼짐 갭 정산의 계약. 여기가 틀리는 방향은 둘뿐이고 둘 다 실사고다:
// 덜 주면 기록이 짧아지고(회원F 2026-08-17), 더 주면 부정 적립이다.

const STARTED_AT = '2026-08-17T09:00:00.000Z';

// 네이티브 총거리를 마음대로 움직일 수 있는 가짜 모듈.
function fakeNative(initialMeters: number) {
  const state = { meters: initialMeters, seeded: [] as number[] };
  return {
    state,
    module: {
      isNativeDistanceAccumulatorAvailable: () => true,
      startDistanceAccumulator: () => true,
      seedDistanceAccumulator: (m: number) => { state.seeded.push(m); },
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

test('잠든 사이 네이티브가 앞선 만큼이, 깨어난 뒤 신선한 첫 GPS 묶음에서 JS 원장에 들어온다', async () => {
  await armRunningRun({ jsMeters: 3050, nativeMeters: 4020 });
  const wakeAt = Date.now() + 120_000;

  assert.equal(captureScreenOffGapOnWake({ nowMs: wakeAt, quietWakeDelayMs: 60_000 }), true);
  assert.ok(getScreenOffGapCaptureForTest());

  // 깨어난 직후의 픽스 — 재생이 아니다.
  reconcileScreenOffGapFromBatch([wakeAt + 1_000], { nowMs: wakeAt + 1_000 });

  assert.equal(getScreenOffGapCaptureForTest(), null);
  assert.ok(Math.abs(getAccumulatedDistanceMeters() - 4020) < 1e-6, `원장이 ${getAccumulatedDistanceMeters()}m`);
  assert.ok(Math.abs(getExternalCreditMeters() - 970) < 1e-6);
  // 스냅샷도 새 총거리를 실었다 — 저장 경로가 읽는 값이 바로 이것이다.
  assert.ok(Math.abs(getSnapshotState().distanceKm - 4.02) < 1e-9);
});

test('밀린 GPS 재생이 관측되면 크레딧을 주지 않는다 — JS가 스스로 따라잡으므로 이중 적립이 된다', async () => {
  await armRunningRun({ jsMeters: 3050, nativeMeters: 4020 });
  const wakeAt = Date.now() + 120_000;
  captureScreenOffGapOnWake({ nowMs: wakeAt, quietWakeDelayMs: 60_000 });

  // 묶음에 잠든 구간의 시각이 찍힌 픽스가 섞여 있다 — 재생이다.
  reconcileScreenOffGapFromBatch([wakeAt - 90_000, wakeAt + 500], { nowMs: wakeAt + 500 });

  assert.equal(getScreenOffGapCaptureForTest(), null);
  assert.equal(getAccumulatedDistanceMeters(), 3050);
  assert.equal(getExternalCreditMeters(), 0);
});

test('크레딧은 잠든 시간에 사람이 달릴 수 있는 상한을 넘지 못한다', async () => {
  // 30초 잠들었는데 네이티브가 2km 앞서 있다고 주장 — 상한(30s×8.5m/s=255m)으로 자른다.
  await armRunningRun({ jsMeters: 1000, nativeMeters: 3000 });
  const wakeAt = Date.now() + 30_000;
  captureScreenOffGapOnWake({ nowMs: wakeAt, quietWakeDelayMs: 60_000 });
  reconcileScreenOffGapFromBatch([wakeAt + 1_000], { nowMs: wakeAt + 1_000 });

  assert.ok(Math.abs(getExternalCreditMeters() - 255) < 1);
});

test('갭 규칙 없는 바이너리에서는 포획 자체가 열리지 않는다', async () => {
  await armRunningRun({ jsMeters: 3050, nativeMeters: 4020 });
  setGapRuleBinarySupport(false);

  assert.equal(captureScreenOffGapOnWake({ nowMs: Date.now() + 120_000 }), false);
  assert.equal(getScreenOffGapCaptureForTest(), null);
});

test('짧은 앱 전환·작은 차이·안 뛰는 상태에서는 포획하지 않는다', async () => {
  await armRunningRun({ jsMeters: 3050, nativeMeters: 4020 });

  // 잠든 시간이 문턱 미만.
  assert.equal(captureScreenOffGapOnWake({ nowMs: Date.now() + MIN_STALE_GAP_MS - 1_000 }), false);

  // 차이가 지터 수준.
  const fake = fakeNative(3050 + MIN_CREDIT_METERS - 5);
  setNativeDistanceAccumulatorModuleForTest(fake.module);
  resetNativeDistanceAccumulatorForTest();
  setNativeDistanceAccumulatorModuleForTest(fake.module);
  await startNativeDistanceAccumulator('match-1', 3050);
  setGapRuleBinarySupport(true);
  assert.equal(captureScreenOffGapOnWake({ nowMs: Date.now() + 120_000 }), false);

  // 런이 안 돌고 있다.
  setSnapshotState({ ...getSnapshotState(), status: 'idle' });
  assert.equal(captureScreenOffGapOnWake({ nowMs: Date.now() + 120_000 }), false);
});

test('정산 전에 런이 바뀌면 남의 런에 이관하지 않는다', async () => {
  await armRunningRun({ jsMeters: 3050, nativeMeters: 4020 });
  const wakeAt = Date.now() + 120_000;
  captureScreenOffGapOnWake({ nowMs: wakeAt, quietWakeDelayMs: 60_000 });

  // 새 런 시작 — startedAt이 달라진다.
  setSnapshotState({ ...getSnapshotState(), startedAt: '2026-08-17T10:00:00.000Z', distanceKm: 0 });
  setAccumulatedDistanceMeters(0);

  reconcileScreenOffGapFromBatch([wakeAt + 1_000], { nowMs: wakeAt + 1_000 });

  assert.equal(getAccumulatedDistanceMeters(), 0);
  assert.equal(getExternalCreditMeters(), 0);
});

test('GPS가 영영 안 오면 타이머가 포획본만으로 정산한다 — 실내에서 런을 끝내는 경우', async () => {
  await armRunningRun({ jsMeters: 3050, nativeMeters: 4020 });
  const wakeAt = Date.now() + 120_000;
  captureScreenOffGapOnWake({ nowMs: wakeAt, quietWakeDelayMs: 20 });

  await new Promise((resolve) => { setTimeout(resolve, 60); });

  assert.equal(getScreenOffGapCaptureForTest(), null);
  assert.ok(Math.abs(getAccumulatedDistanceMeters() - 4020) < 1e-6);
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
