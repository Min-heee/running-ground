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

// 표시 시간이 뒤로 갈 수 있는 폭. 이보다 작은 후퇴는 **여러 발행자가 서로 다른 기준으로**
// 같은 시계를 쓰는 것이므로 버린다(기록 탭의 시간이 초당 두 번 튀던 증상). 이보다 큰 후퇴는
// 새 러닝이거나 의도한 재기준점이라 통과시킨다 — 실제 러닝 하나 안에서 시간이 30초 넘게
// 뒤로 가는 정상적인 경우는 없다(워밍업→공식 출발도 0에서 시작해 앞으로만 간다).
const MAX_DISPLAY_ELAPSED_REGRESSION_SECONDS = 30;

export function publishLiveTrackingMetricFrame(frame: Partial<LiveTrackingMetricFrame>) {
  const next = {
    ...currentFrame,
    ...frame,
  };

  // 시간은 한 화면에 하나뿐인 값이라, 발행자가 둘 이상이면 어느 하나가 옳아도 **번갈아**
  // 보이는 순간 둘 다 틀려 보인다. 그래서 옳고 그름을 여기서 따지지 않고, 뒤로 가는 작은
  // 걸음만 막는다 — 발행자가 몇이든 화면의 시간은 단조롭게 흐른다. 평균 페이스는 시간이
  // 분모라 반드시 같이 버려야 한다(그러지 않으면 시간은 멎고 페이스만 두 값으로 튄다).
  if (
    frame.elapsedSeconds !== undefined
    && frame.elapsedSeconds < currentFrame.elapsedSeconds
    && currentFrame.elapsedSeconds - frame.elapsedSeconds < MAX_DISPLAY_ELAPSED_REGRESSION_SECONDS
  ) {
    next.elapsedSeconds = currentFrame.elapsedSeconds;
    next.averagePace = currentFrame.averagePace;
  }

  emitLiveTrackingMetricFrame(next);
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
