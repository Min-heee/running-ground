import { useSyncExternalStore } from 'react';

export type LiveTrackingMetricFrame = {
  distanceKm: number;
  elapsedSeconds: number;
  // Wall-clock elapsed (slot/start-anchored, no JS timer) paired with distanceKm for MY
  // average/arena pace. Unlike `elapsedSeconds` — which the slot ticker advances via a
  // setInterval the OS freezes while JS is backgrounded — this stays fresh with the screen
  // off, so the avg pace voice announcement and on-resume avg pace do not freeze (RC-4).
  arenaElapsedSeconds: number;
  currentPace: string;
  averagePace: string;
  cadenceSpm: number | null;
  elevationGainM: number;
};

const INITIAL_LIVE_TRACKING_METRIC_FRAME: LiveTrackingMetricFrame = {
  distanceKm: 0,
  elapsedSeconds: 0,
  arenaElapsedSeconds: 0,
  currentPace: '--:--/km',
  averagePace: '--:--/km',
  cadenceSpm: null,
  elevationGainM: 0,
};

let currentFrame = INITIAL_LIVE_TRACKING_METRIC_FRAME;
const listeners = new Set<() => void>();

function areLiveTrackingMetricFramesEqual(left: LiveTrackingMetricFrame, right: LiveTrackingMetricFrame) {
  return left.distanceKm === right.distanceKm
    && left.elapsedSeconds === right.elapsedSeconds
    && left.arenaElapsedSeconds === right.arenaElapsedSeconds
    && left.currentPace === right.currentPace
    && left.averagePace === right.averagePace
    && left.cadenceSpm === right.cadenceSpm
    && left.elevationGainM === right.elevationGainM;
}

function emitLiveTrackingMetricFrame(nextFrame: LiveTrackingMetricFrame) {
  if (areLiveTrackingMetricFramesEqual(currentFrame, nextFrame)) {
    return;
  }

  currentFrame = nextFrame;
  listeners.forEach((listener) => listener());
}

export function publishLiveTrackingMetricFrame(frame: Partial<LiveTrackingMetricFrame>) {
  emitLiveTrackingMetricFrame({
    ...currentFrame,
    ...frame,
  });
}

export function resetLiveTrackingMetricFrame() {
  emitLiveTrackingMetricFrame(INITIAL_LIVE_TRACKING_METRIC_FRAME);
}

export function getLiveTrackingMetricFrameSnapshot() {
  return currentFrame;
}

export function subscribeLiveTrackingMetricFrame(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLiveTrackingMetricFrame() {
  return useSyncExternalStore(
    subscribeLiveTrackingMetricFrame,
    getLiveTrackingMetricFrameSnapshot,
    getLiveTrackingMetricFrameSnapshot,
  );
}

export function resetLiveTrackingMetricStoreForTest() {
  currentFrame = INITIAL_LIVE_TRACKING_METRIC_FRAME;
  listeners.clear();
}
