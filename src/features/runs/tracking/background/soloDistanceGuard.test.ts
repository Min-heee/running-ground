import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import {
  resetNativeDistanceAccumulatorForTest,
  setGapRuleBinarySupport,
  setNativeDistanceAccumulatorModuleForTest,
} from './distanceAccumulatorController';
import { setBackgroundMatchProgressContext } from './backgroundMatchProgressSync';
import { recordBackgroundSnapshotUpdate, setAppBackgroundState } from './backgroundSyncDiagnostics';
import { resetRouteAccumulator, setAccumulatedDistanceMeters } from './routeAccumulator';
import {
  armSoloDistanceAccumulatorOnBackground,
  reseedSoloDistanceAccumulatorAfterFixes,
  resetSoloDistanceGuardForTest,
  SOLO_RESEED_INTERVAL_MS,
} from './soloDistanceGuard';
import { getSnapshotState, setSnapshotState, INITIAL_SNAPSHOT } from './snapshotStore';

// 솔로 런 화면꺼짐 보호의 계약: 혼자 뛰는 러닝이 백그라운드로 들어갈 때만 누적기가 켜지고,
// JS가 살아 있는 동안엔 기준선이 JS 총거리로 되심어진다. 매치·전면·갭규칙 없는 바이너리
// 에서는 아무 일도 하지 않는다.

const STARTED_AT = '2026-08-19T10:00:00.000Z';

function fakeNative() {
  const state = { started: [] as string[], seeded: [] as number[] };
  return {
    state,
    module: {
      isNativeDistanceAccumulatorAvailable: () => true,
      startDistanceAccumulator: () => true,
      seedDistanceAccumulator: (meters: number) => { state.seeded.push(meters); },
      getAccumulatedDistanceMeters: () => 0,
      resetDistanceAccumulator: () => undefined,
      stopDistanceAccumulator: () => undefined,
    },
  };
}

beforeEach(() => {
  resetSoloDistanceGuardForTest();
  resetNativeDistanceAccumulatorForTest();
  resetRouteAccumulator();
  setSnapshotState({ ...INITIAL_SNAPSHOT });
  setBackgroundMatchProgressContext(null);
  setAppBackgroundState(false);
  setNativeDistanceAccumulatorModuleForTest(undefined);
});

function armSoloRun({ jsMeters = 2500 }: { jsMeters?: number } = {}) {
  const fake = fakeNative();
  setNativeDistanceAccumulatorModuleForTest(fake.module);
  setGapRuleBinarySupport(true);
  setAccumulatedDistanceMeters(jsMeters);
  setSnapshotState({
    ...INITIAL_SNAPSHOT,
    status: 'running',
    startedAt: STARTED_AT,
    distanceKm: jsMeters / 1000,
  });
  // 신선도 시계 무장 — 실제 앱에서는 태스크 시작·픽스 커밋이 심는다. 이게 없으면 시계가
  // 비어 '신선'으로 읽혀 동결 테스트가 성립하지 않는다.
  recordBackgroundSnapshotUpdate(true);
  return fake;
}

test('솔로 런이 백그라운드로 들어가면 누적기가 켜지고 JS 총거리가 심어진다', async () => {
  const fake = armSoloRun({ jsMeters: 2500 });

  assert.equal(await armSoloDistanceAccumulatorOnBackground(), true);
  assert.deepEqual(fake.state.seeded, [2500]);
});

test('매치가 진행 중이면 솔로 가드는 물러난다 — 매치 플러시가 누적기의 주인이다', async () => {
  armSoloRun();
  setBackgroundMatchProgressContext({
    matchId: 'm-1',
    mode: 'duel',
    distanceKm: 5,
    slotStartAt: STARTED_AT,
  } as never);

  assert.equal(await armSoloDistanceAccumulatorOnBackground(), false);

  setBackgroundMatchProgressContext(null);
});

test('갭 규칙 없는 바이너리·안 뛰는 상태에서는 켜지지 않는다', async () => {
  armSoloRun();
  setGapRuleBinarySupport(false);
  assert.equal(await armSoloDistanceAccumulatorOnBackground(), false);

  setGapRuleBinarySupport(true);
  setSnapshotState({ ...getSnapshotState(), status: 'idle' });
  assert.equal(await armSoloDistanceAccumulatorOnBackground(), false);
});

test('얼어붙은 원장으로는 켜지도 되심지도 않는다 — 정산할 갭을 지우는 경합 봉쇄', async () => {
  // iOS 깨어남 경합: 밀린 픽스 묶음이 AppState보다 먼저 도착해 전부 필터에 떨어지고(거리
  // 동결 유지), 재파종만 통과하면 네이티브의 잠든 구간이 정산 전에 지워진다. 안드로이드
  // 살아있는-동결(2026-08-09 갤럭시)도 같은 길. 신선도 게이트가 둘 다 막는다.
  const fake = armSoloRun({ jsMeters: 3000 });
  await armSoloDistanceAccumulatorOnBackground();
  const seededAtArm = fake.state.seeded.length;
  setAppBackgroundState(true);

  // 거리가 60초째 안 늘었다(동결) — 재파종 금지.
  reseedSoloDistanceAccumulatorAfterFixes({ nowMs: Date.now() + 60_000 });
  assert.equal(fake.state.seeded.length, seededAtArm);

  // 무장 역시 동결 상태에서는 거부된다 — 이중 'background' 이벤트가 같은-키 재시동으로
  // 얼어붙은 값을 되심는 길까지 막는다.
  assert.equal(await armSoloDistanceAccumulatorOnBackground({ nowMs: Date.now() + 60_000 }), false);

  setAppBackgroundState(false);
});

test('재파종은 백그라운드에서만, 간격을 지켜서 이뤄진다', async () => {
  const fake = armSoloRun({ jsMeters: 3000 });
  await armSoloDistanceAccumulatorOnBackground();
  const seededAtArm = fake.state.seeded.length;
  const base = Date.now();

  // 전면에서는 재파종하지 않는다 — 깨어날 때 누적기가 이미 꺼졌다.
  setAppBackgroundState(false);
  reseedSoloDistanceAccumulatorAfterFixes({ nowMs: base });
  assert.equal(fake.state.seeded.length, seededAtArm);

  // 백그라운드: 첫 재파종.
  setAppBackgroundState(true);
  setAccumulatedDistanceMeters(3100);
  reseedSoloDistanceAccumulatorAfterFixes({ nowMs: base });
  assert.deepEqual(fake.state.seeded.slice(seededAtArm), [3100]);

  // 간격 안에서는 스로틀.
  setAccumulatedDistanceMeters(3120);
  reseedSoloDistanceAccumulatorAfterFixes({ nowMs: base + SOLO_RESEED_INTERVAL_MS - 1000 });
  assert.equal(fake.state.seeded.length, seededAtArm + 1);

  // 간격이 지나면 다시.
  reseedSoloDistanceAccumulatorAfterFixes({ nowMs: base + SOLO_RESEED_INTERVAL_MS + 1 });
  assert.deepEqual(fake.state.seeded.slice(seededAtArm), [3100, 3120]);

  setAppBackgroundState(false);
});
