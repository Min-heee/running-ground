import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureRelaunchNativeEvidence,
  consumeRelaunchNativeEvidenceMeters,
  resetRelaunchNativeEvidenceForTest,
  resolveRelaunchGapCreditMeters,
} from './relaunchGapCredit';
import {
  resetNativeDistanceAccumulatorForTest,
  setGapRuleBinarySupport,
  setNativeDistanceAccumulatorModuleForTest,
} from './distanceAccumulatorController';

// 8/23 사고의 재실행 반쪽: 프로세스가 죽은 사이 네이티브가 센 거리(증거)를 복원이 정산하는
// 계산 규칙 — 갭 포획(settle)과 같은 상한·바닥이어야 하고, 증거 소비는 정확히 1회여야 한다.

const BASE = {
  evidenceMeters: 3700,
  restoredMeters: 260,
  gapMs: 20 * 60 * 1000,
  maxSpeedMps: 8.5,
  minCreditMeters: 80,
};

test('the incident shape credits the screen-off gap: 0.26km restored, 3.7km evidence, 20min asleep', () => {
  // raw 3440m < cap 10200m → 전액 적립.
  assert.equal(resolveRelaunchGapCreditMeters(BASE), 3440);
});

test('the sleep-duration speed cap bounds an inflated evidence total', () => {
  // 60초 잠들고 5km 증거 — 사람이 달릴 수 있는 510m까지만.
  assert.equal(
    resolveRelaunchGapCreditMeters({ ...BASE, evidenceMeters: 5000, gapMs: 60 * 1000 }),
    510,
  );
});

test('evidence at or behind the restored ledger credits nothing', () => {
  assert.equal(resolveRelaunchGapCreditMeters({ ...BASE, evidenceMeters: 260 }), 0);
  assert.equal(resolveRelaunchGapCreditMeters({ ...BASE, evidenceMeters: 100 }), 0);
  assert.equal(resolveRelaunchGapCreditMeters({ ...BASE, evidenceMeters: 0 }), 0);
});

test('credits below the floor are dropped, and a zero/garbled gap credits nothing', () => {
  assert.equal(resolveRelaunchGapCreditMeters({ ...BASE, evidenceMeters: 330 }), 0);
  assert.equal(resolveRelaunchGapCreditMeters({ ...BASE, gapMs: 0 }), 0);
  assert.equal(resolveRelaunchGapCreditMeters({ ...BASE, gapMs: Number.NaN }), 0);
});

test('capture prefers the larger of the revived bus total and the persisted disk total, and consume is once-only', async () => {
  resetRelaunchNativeEvidenceForTest();
  resetNativeDistanceAccumulatorForTest();
  setGapRuleBinarySupport(true);
  setNativeDistanceAccumulatorModuleForTest({
    isNativeDistanceAccumulatorAvailable: () => true,
    startDistanceAccumulator: () => true,
    seedDistanceAccumulator: () => undefined,
    // 같은 프로세스 부활: 버스가 3400m를 쥔다. 디스크 기록은 5초 스로틀만큼 뒤처진 3350m.
    getAccumulatedDistanceMeters: () => 3400,
    getPersistedDistanceSessionMeters: () => 3350,
    resetDistanceAccumulator: () => undefined,
    stopDistanceAccumulator: () => undefined,
  });

  await captureRelaunchNativeEvidence();
  assert.equal(consumeRelaunchNativeEvidenceMeters(), 3400, 'the larger source wins');
  assert.equal(consumeRelaunchNativeEvidenceMeters(), 0, 'a second consume gets nothing — no double-credit');

  resetRelaunchNativeEvidenceForTest();
  resetNativeDistanceAccumulatorForTest();
  setNativeDistanceAccumulatorModuleForTest(undefined);
  setGapRuleBinarySupport(false);
});

test('a fresh process with only the disk record still yields evidence', async () => {
  resetRelaunchNativeEvidenceForTest();
  resetNativeDistanceAccumulatorForTest();
  setGapRuleBinarySupport(true);
  setNativeDistanceAccumulatorModuleForTest({
    isNativeDistanceAccumulatorAvailable: () => true,
    startDistanceAccumulator: () => true,
    seedDistanceAccumulator: () => undefined,
    getAccumulatedDistanceMeters: () => 0,
    getPersistedDistanceSessionMeters: () => 3350,
    resetDistanceAccumulator: () => undefined,
    stopDistanceAccumulator: () => undefined,
  });

  await captureRelaunchNativeEvidence();
  assert.equal(consumeRelaunchNativeEvidenceMeters(), 3350);

  resetRelaunchNativeEvidenceForTest();
  resetNativeDistanceAccumulatorForTest();
  setNativeDistanceAccumulatorModuleForTest(undefined);
  setGapRuleBinarySupport(false);
});
