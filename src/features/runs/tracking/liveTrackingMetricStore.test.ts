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
    elevationGainM: 0,
  });

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
