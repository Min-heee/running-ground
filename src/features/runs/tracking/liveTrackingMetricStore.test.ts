import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getLiveTrackingMetricFrameSnapshot,
  type LiveTrackingMetricFrame,
  publishLiveTrackingMetricFrame,
  resetLiveTrackingMetricFrame,
  resetLiveTrackingMetricStoreForTest,
  subscribeLiveTrackingMetricFrame,
} from './liveTrackingMetricStore';

test('live tracking metric store publishes partial frame updates', () => {
  resetLiveTrackingMetricStoreForTest();
  let emitCount = 0;
  const unsubscribe = subscribeLiveTrackingMetricFrame(() => {
    emitCount += 1;
  });

  publishLiveTrackingMetricFrame({
    distanceKm: 1.23,
    elapsedSeconds: 300,
    averagePace: '04:04/km',
  });

  assert.equal(emitCount, 1);
  assert.deepEqual(getLiveTrackingMetricFrameSnapshot(), {
    distanceKm: 1.23,
    elapsedSeconds: 300,
    arenaElapsedSeconds: 0,
    currentPace: '--:--/km',
    averagePace: '04:04/km',
    cadenceSpm: null,
    totalSteps: null,
    elevationGainM: 0,
  });

  unsubscribe();
});

test('live tracking metric store publishes totalSteps alongside cadence for the cadence watchdog', () => {
  resetLiveTrackingMetricStoreForTest();
  let emitCount = 0;
  const unsubscribe = subscribeLiveTrackingMetricFrame(() => {
    emitCount += 1;
  });

  publishLiveTrackingMetricFrame({ cadenceSpm: 160, totalSteps: 800 });
  assert.equal(getLiveTrackingMetricFrameSnapshot().totalSteps, 800);
  assert.equal(emitCount, 1);

  // 걸음만 달라져도 프레임은 새로 발행된다 (창 델타 재료).
  publishLiveTrackingMetricFrame({ cadenceSpm: 160, totalSteps: 803 });
  assert.equal(getLiveTrackingMetricFrameSnapshot().totalSteps, 803);
  assert.equal(emitCount, 2);

  unsubscribe();
});

test('live tracking metric store skips identical frames and resets', () => {
  resetLiveTrackingMetricStoreForTest();
  let emitCount = 0;
  const unsubscribe = subscribeLiveTrackingMetricFrame(() => {
    emitCount += 1;
  });

  publishLiveTrackingMetricFrame({ elapsedSeconds: 10 });
  publishLiveTrackingMetricFrame({ elapsedSeconds: 10 });
  resetLiveTrackingMetricFrame();

  assert.equal(emitCount, 2);
  assert.equal(getLiveTrackingMetricFrameSnapshot().elapsedSeconds, 0);
  assert.equal(getLiveTrackingMetricFrameSnapshot().distanceKm, 0);

  unsubscribe();
});

test('live tracking metric store delivers every 1Hz elapsed tick to the leaf', () => {
  // B1: the elapsed-display 1Hz value now flows ONLY through this leaf store
  // (the arena/raceboard frame no longer re-injects it). Each distinct second
  // must still reach the subscriber so the visible timer keeps ticking.
  resetLiveTrackingMetricStoreForTest();
  const seenElapsed: number[] = [];
  const unsubscribe = subscribeLiveTrackingMetricFrame(() => {
    seenElapsed.push(getLiveTrackingMetricFrameSnapshot().elapsedSeconds);
  });

  for (let second = 1; second <= 5; second += 1) {
    publishLiveTrackingMetricFrame({ elapsedSeconds: second });
  }

  assert.deepEqual(seenElapsed, [1, 2, 3, 4, 5]);
  assert.equal(getLiveTrackingMetricFrameSnapshot().elapsedSeconds, 5);

  unsubscribe();
});

test('표시 시간은 뒤로 가지 않는다 — 기준이 다른 발행자가 둘이어도 한 계열로만 흐른다', () => {
  // 갤럭시에서 기록 탭의 시간이 34:31 ↔ 34:50으로 초당 두 번 튀던 증상의 회귀 못.
  // 원인은 같은 시계에 기준이 다른 발행자가 둘 붙은 것이었다(하나는 서버 슬롯 기준,
  // 하나는 기기 시계 기준). 근치는 기준 통일이지만, 이 스토어는 발행자가 몇이든
  // 화면의 시간이 단조롭게 흐르도록 마지막 방벽이 된다. 평균 페이스는 시간이 분모라
  // 함께 버려야 한다 — 안 그러면 시간은 멎고 페이스만 두 값으로 튄다.
  resetLiveTrackingMetricStoreForTest();
  const seenElapsed: number[] = [];
  const seenPace: string[] = [];
  const unsubscribe = subscribeLiveTrackingMetricFrame(() => {
    const frame = getLiveTrackingMetricFrameSnapshot();
    seenElapsed.push(frame.elapsedSeconds);
    seenPace.push(frame.averagePace);
  });

  // 두 발행자가 18초 어긋난 채 번갈아 쓴다.
  publishLiveTrackingMetricFrame({ elapsedSeconds: 2071, averagePace: '06:09/km' });
  publishLiveTrackingMetricFrame({ elapsedSeconds: 2089, averagePace: '06:13/km' });
  publishLiveTrackingMetricFrame({ elapsedSeconds: 2072, averagePace: '06:09/km' });
  publishLiveTrackingMetricFrame({ elapsedSeconds: 2090, averagePace: '06:13/km' });

  // 뒤로 가는 걸음은 통째로 버려지고(시간·페이스 모두), 앞으로 가는 것만 남는다.
  assert.deepEqual(seenElapsed, [2071, 2089, 2090]);
  assert.deepEqual(seenPace, ['06:09/km', '06:13/km', '06:13/km']);

  unsubscribe();
});

test('큰 되감기는 통과시킨다 — 새 러닝/재기준점까지 막으면 시계가 영영 멎는다', () => {
  resetLiveTrackingMetricStoreForTest();
  publishLiveTrackingMetricFrame({ elapsedSeconds: 2400, averagePace: '06:09/km' });
  // 새 세션이 0에서 다시 시작(리셋을 못 탄 경로여도 시계가 살아나야 한다).
  publishLiveTrackingMetricFrame({ elapsedSeconds: 3, averagePace: '--:--/km' });

  assert.equal(getLiveTrackingMetricFrameSnapshot().elapsedSeconds, 3);
  assert.equal(getLiveTrackingMetricFrameSnapshot().averagePace, '--:--/km');
});

test('live tracking metric store equality gate does not drop any changed field', () => {
  // B1 guard: the leaf equality gate must mirror the frame equality so no real
  // update is swallowed. Changing each field in isolation must emit exactly once.
  const fieldUpdates: Partial<LiveTrackingMetricFrame>[] = [
    { distanceKm: 2.5 },
    { elapsedSeconds: 42 },
    { arenaElapsedSeconds: 37 },
    { currentPace: '05:12/km' },
    { averagePace: '05:30/km' },
    { cadenceSpm: 168 },
    { elevationGainM: 17 },
  ];

  for (const update of fieldUpdates) {
    resetLiveTrackingMetricStoreForTest();
    let emitCount = 0;
    const unsubscribe = subscribeLiveTrackingMetricFrame(() => {
      emitCount += 1;
    });

    publishLiveTrackingMetricFrame(update);
    // Re-publishing the identical value must NOT emit again (no churn), but the
    // first change must have been delivered (not dropped).
    publishLiveTrackingMetricFrame(update);

    const [key, value] = Object.entries(update)[0] as [keyof LiveTrackingMetricFrame, number | string | null];
    assert.equal(emitCount, 1, `field ${key} should emit exactly once`);
    assert.equal(getLiveTrackingMetricFrameSnapshot()[key], value);

    unsubscribe();
  }
});
