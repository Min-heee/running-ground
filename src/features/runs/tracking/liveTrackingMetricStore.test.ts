import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getLiveTrackingMetricFrameSnapshot,
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
