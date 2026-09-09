import * as Location from 'expo-location';
import {
  calculateDistanceBetweenPoints,
  calculateElevationGainM,
  formatPaceFromSecondsPerKm,
} from '@/features/runs/tracking';
import type { RunRoutePoint } from '@/domain';
import {
  buildFallbackPaceSecondsPerKm,
  buildRoutePoint,
  buildStableColdStartRouteCandidate,
  calculateRouteWindowDistanceMeters,
  clamp,
  CURRENT_PACE_MIN_DISTANCE_METERS,
  CURRENT_PACE_MIN_WINDOW_MS,
  CURRENT_PACE_SMOOTHING_WINDOW_MS,
  CURRENT_PACE_STALE_AFTER_MS,
  findColdStartExcursionAnchorIndex,
  findMidRunLateralJitterAnchorIndex,
  MAX_REASONABLE_PACE_SECONDS_PER_KM,
  MAX_REASONABLE_RUNNING_SPEED_MPS,
  MAX_TRACKING_ACCURACY_METERS,
  MIN_LOCATION_TIME_DELTA_MS,
  MIN_REASONABLE_PACE_SECONDS_PER_KM,
  MIN_TELEPORT_FILTER_DISTANCE_METERS,
  isSignalLossGapMs,
  normalizeAccuracyMeters,
  normalizeReliableSpeedMps,
  resolveDistanceGateMeters,
  resolveLocationTimestampMs,
  resolveRoutePointTimestampMs,
  shouldIgnoreNoisySegment,
  trimColdStartFixBuffer,
} from '@/features/runs/tracking/background/locationDistance';
import {
  commitSnapshot,
  getSnapshotState,
} from '@/features/runs/tracking/background/snapshotStore';
import {
  buildWarmupLocationSnapshot,
} from '@/features/runs/tracking/background/warmupSnapshotPolicy';
import { rgDiagLog } from '@/utils/rgPerfTrace';
import { recordRawFixSpeed, resetRawFixSpeed } from './rawFixSpeedStore';

let accumulatedDistanceMeters = 0;
// 화면꺼짐 갭 크레딧 — GPS 경로가 아니라 **네이티브 누적기에서 이관받은** 거리. 따로 든다:
// accumulatedDistanceMeters는 아래 두 곳(냉시동 이탈·지터 붕괴)에서 경로로부터 통째로
// 재계산되는데, 크레딧 구간은 경로에 점이 없어서 합산에 안 들어가면 그 재계산이 크레딧을
// 소리 없이 지운다 — 다음 커브 하나에 되찾은 거리가 도로 사라지는 셈이다.
let externalCreditMeters = 0;
// 화면꺼짐 갭 정산이 확정된 '깨어난 시각' — 이보다 먼저 찍힌 픽스는 받지 않는다. 크레딧은
// 네이티브가 깨어난 순간까지 센 총거리를 기준으로 하므로, 그 이전 시각이 찍힌 픽스(OS가
// 늦게 재생하는 수면 꼬리, 나이 필터 15초는 통과할 수 있다)가 정산 **뒤에** 적립되면 같은
// 구간이 두 번 세어진다 — 재검증이 잡은 마지막 이중 적립 경로다.
let preWakeFixFloorMs: number | null = null;
let accumulatedElevationGainMeters = 0;
let smoothedCurrentPaceSecondsPerKm: number | null = null;
let smoothedPaceUpdatedAtMs: number | null = null;
let coldStartFixBuffer: RunRoutePoint[] = [];
let lastCountedPoint: RunRoutePoint | null = null;

export function resetRouteAccumulator() {
  // 새 런은 이전 런의 원시 속도 샘플을 물려받지 않는다.
  resetRawFixSpeed();
  rgDiagLog('[RG dist] ===== RESET (run start) =====');
  accumulatedDistanceMeters = 0;
  externalCreditMeters = 0;
  preWakeFixFloorMs = null;
  accumulatedElevationGainMeters = 0;
  smoothedCurrentPaceSecondsPerKm = null;
  smoothedPaceUpdatedAtMs = null;
  coldStartFixBuffer = [];
  lastCountedPoint = null;
}

// 경로에서 **실제로 관측한** 구간만 합산한다 — 신호 끊김 갭(두 점 사이 30초 초과)의 직선은
// 우리가 본 경로가 아니므로 뺀다. 라이브 적립(아래 isSignalLossGapMs 분기)이 그 직선을 0m
// 처리하고 앵커만 옮기는 것과 정확히 같은 규칙이다.
//
// 이게 없으면 경로 기반 재계산(냉시동 이탈·지터 붕괴)이 원시 하버사인 합으로 그 직선을
// 도로 적립한다. 화면꺼짐 갭 크레딧이 이관된 런에서는 같은 구간이 크레딧 + 직선으로 **이중**
// 적립되고(적대 검증 P0), 크레딧이 없어도 잠든 구간의 직선이 재계산 한 번에 통째로 되살아
// 나는 기존 결함이기도 했다.
export function sumObservedRouteDistanceMeters(route: RunRoutePoint[]): number {
  let distanceMeters = 0;

  for (let index = 1; index < route.length; index += 1) {
    const previousMs = resolveRoutePointTimestampMs(route[index - 1]);
    const nextMs = resolveRoutePointTimestampMs(route[index]);

    if (previousMs !== null && nextMs !== null && isSignalLossGapMs(nextMs - previousMs)) {
      continue;
    }

    distanceMeters += calculateDistanceBetweenPoints(route[index - 1], route[index]);
  }

  return distanceMeters;
}

export function getAccumulatedDistanceMeters() {
  return accumulatedDistanceMeters;
}

export function setAccumulatedDistanceMeters(value: number) {
  accumulatedDistanceMeters = Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function getExternalCreditMeters() {
  return externalCreditMeters;
}

export function setPreWakeFixFloorMs(value: number | null) {
  preWakeFixFloorMs = Number.isFinite(value as number) && (value as number) > 0 ? (value as number) : null;
}

export function getPreWakeFixFloorMs() {
  return preWakeFixFloorMs;
}

// 크래시 복원 전용 — 복원된 총거리에 크레딧이 들어 있으면 그 몫을 알려줘야 이후의 경로
// 재계산이 크레딧을 지우지 않는다.
export function setExternalCreditMeters(value: number) {
  externalCreditMeters = Number.isFinite(value) ? Math.max(0, value) : 0;
}

// 화면꺼짐 갭 크레딧 반영 — JS가 잠든 사이 네이티브 누적기가 센 거리를 JS 원장에 이관한다.
// 호출자는 screenOffGapReconcile 하나뿐이고, 리플레이 판별·상한·바이너리 게이트는 전부
// 그쪽 책임이다. 여기서는 원장에 더하고 스냅샷을 새 총거리로 커밋만 한다 — 그 커밋이
// distanceAdvanced=true로 기록되면서 신선도 시계도 함께 되살아난다.
export function creditExternalDistanceMeters(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) {
    return accumulatedDistanceMeters;
  }

  externalCreditMeters += meters;
  accumulatedDistanceMeters += meters;
  rgDiagLog(`[RG dist] CREDIT screen-off gap +${meters.toFixed(1)}m total=${(accumulatedDistanceMeters / 1000).toFixed(3)}`);

  const snapshotState = getSnapshotState();
  commitSnapshot({
    ...snapshotState,
    distanceKm: Number((accumulatedDistanceMeters / 1000).toFixed(2)),
  });

  return accumulatedDistanceMeters;
}

export function getAccumulatedElevationGainMeters() {
  return accumulatedElevationGainMeters;
}

export function setAccumulatedElevationGainMeters(value: number) {
  accumulatedElevationGainMeters = Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function resetPaceSmoothing() {
  smoothedCurrentPaceSecondsPerKm = null;
  smoothedPaceUpdatedAtMs = null;
}

function formatSmoothedPaceCandidate(candidateSecondsPerKm: number | null, referenceTimestampMs: number) {
  if (candidateSecondsPerKm === null) {
    if (
      smoothedCurrentPaceSecondsPerKm !== null
      && smoothedPaceUpdatedAtMs !== null
      && referenceTimestampMs - smoothedPaceUpdatedAtMs <= CURRENT_PACE_STALE_AFTER_MS
    ) {
      return formatPaceFromSecondsPerKm(smoothedCurrentPaceSecondsPerKm);
    }

    smoothedCurrentPaceSecondsPerKm = null;
    smoothedPaceUpdatedAtMs = null;
    return '--:--/km';
  }

  const safeCandidateSecondsPerKm = clamp(
    candidateSecondsPerKm,
    MIN_REASONABLE_PACE_SECONDS_PER_KM,
    MAX_REASONABLE_PACE_SECONDS_PER_KM,
  );

  if (smoothedCurrentPaceSecondsPerKm === null) {
    smoothedCurrentPaceSecondsPerKm = safeCandidateSecondsPerKm;
  } else {
    const changeRatio = Math.abs(safeCandidateSecondsPerKm - smoothedCurrentPaceSecondsPerKm)
      / Math.max(1, smoothedCurrentPaceSecondsPerKm);
    const smoothingAlpha = changeRatio > 0.35 ? 0.22 : 0.42;
    smoothedCurrentPaceSecondsPerKm += (
      safeCandidateSecondsPerKm - smoothedCurrentPaceSecondsPerKm
    ) * smoothingAlpha;
  }

  smoothedPaceUpdatedAtMs = referenceTimestampMs;
  return formatPaceFromSecondsPerKm(smoothedCurrentPaceSecondsPerKm);
}

function buildSmoothedCurrentPace(
  route: RunRoutePoint[],
  fallbackSpeedMps?: number | null,
  referenceTimestampMs = Date.now(),
) {
  const fallbackPaceSecondsPerKm = buildFallbackPaceSecondsPerKm(fallbackSpeedMps);

  if (route.length < 2) {
    return formatSmoothedPaceCandidate(fallbackPaceSecondsPerKm, referenceTimestampMs);
  }

  const endPoint = route[route.length - 1];
  const endMs = resolveRoutePointTimestampMs(endPoint);

  if (endMs === null) {
    return formatSmoothedPaceCandidate(fallbackPaceSecondsPerKm, referenceTimestampMs);
  }

  if (referenceTimestampMs - endMs > CURRENT_PACE_STALE_AFTER_MS && fallbackPaceSecondsPerKm === null) {
    return formatSmoothedPaceCandidate(null, referenceTimestampMs);
  }

  let startIndex = route.length - 2;

  while (startIndex > 0) {
    const candidateMs = new Date(route[startIndex].timestamp).getTime();

    if (Number.isNaN(candidateMs) || endMs - candidateMs >= CURRENT_PACE_SMOOTHING_WINDOW_MS) {
      break;
    }

    startIndex -= 1;
  }

  const paceWindow = route.slice(startIndex);
  const startMs = resolveRoutePointTimestampMs(paceWindow[0]);

  if (startMs === null) {
    return formatSmoothedPaceCandidate(fallbackPaceSecondsPerKm, referenceTimestampMs);
  }

  const elapsedMs = endMs - startMs;

  if (elapsedMs < CURRENT_PACE_MIN_WINDOW_MS) {
    return formatSmoothedPaceCandidate(fallbackPaceSecondsPerKm, referenceTimestampMs);
  }

  const distanceMeters = calculateRouteWindowDistanceMeters(paceWindow);

  if (distanceMeters < CURRENT_PACE_MIN_DISTANCE_METERS) {
    return formatSmoothedPaceCandidate(fallbackPaceSecondsPerKm, referenceTimestampMs);
  }

  const secondsPerKm = (elapsedMs / 1000) / (distanceMeters / 1000);
  return formatSmoothedPaceCandidate(secondsPerKm, referenceTimestampMs);
}

export function appendTrackedLocation(location: Location.LocationObject) {
  const snapshotState = getSnapshotState();

  if (snapshotState.status !== 'running') {
    return;
  }

  // 케이던스 워치독용 원시 속도 — 아래 어떤 필터(정산 바닥·워밍업·정확도·순간이동)에
  // 걸려 거리/페이스가 멈춰도 "이동 중"이라는 사실은 남긴다. 채택 판단과 무관.
  recordRawFixSpeed(location);

  const locationTimestampMs = resolveLocationTimestampMs(location);

  if (locationTimestampMs === null) {
    return;
  }

  // 정산이 이미 보상한 구간의 픽스는 버린다 — 페이스 갱신조차 하지 않는다(수면 중의 속도라
  // 이미 낡았다). 정산 전에 도착한 픽스는 여기 걸리지 않고, 그 몫은 정산이 자동 차감한다.
  if (preWakeFixFloorMs !== null && locationTimestampMs < preWakeFixFloorMs) {
    rgDiagLog(`[RG dist] DROP pre-wake settled fix ts=${locationTimestampMs} floor=${preWakeFixFloorMs}`);
    return;
  }

  const warmupSnapshot = buildWarmupLocationSnapshot(snapshotState);
  if (warmupSnapshot) {
    commitSnapshot(warmupSnapshot);
    return;
  }

  const accuracyM = normalizeAccuracyMeters(location.coords.accuracy);
  const reliableSpeedMps = normalizeReliableSpeedMps(location.coords.speed);

  if (accuracyM !== null && accuracyM > MAX_TRACKING_ACCURACY_METERS) {
    rgDiagLog(`[RG dist] DROP acc-high acc=${accuracyM}`);
    commitSnapshot({
      ...snapshotState,
      currentPace: buildSmoothedCurrentPace(snapshotState.route, reliableSpeedMps, locationTimestampMs),
    });
    return;
  }

  const nextPoint = buildRoutePoint(location);
  const previousPoint = snapshotState.route.length ? snapshotState.route[snapshotState.route.length - 1] : null;
  let nextAccumulatedDistanceMeters = accumulatedDistanceMeters;

  if (!previousPoint) {
    coldStartFixBuffer = trimColdStartFixBuffer([...coldStartFixBuffer, nextPoint]);
    const stableRoute = buildStableColdStartRouteCandidate(coldStartFixBuffer);

    if (!stableRoute) {
      commitSnapshot({
        ...snapshotState,
        currentPace: buildSmoothedCurrentPace(snapshotState.route, reliableSpeedMps, locationTimestampMs),
      });
      return;
    }

    // COLD-START SEED = 0: do NOT bank the intra-cluster warmup path. The stable anchor is the
    // cluster centroid/last fix; distance accumulates only AFTER it from the last counted point, so
    // ~30-60m of warmup jitter (the start spike that made two phones diverge) is never counted.
    accumulatedDistanceMeters = externalCreditMeters;
    accumulatedElevationGainMeters = calculateElevationGainM(stableRoute);
    lastCountedPoint = stableRoute[stableRoute.length - 1] ?? null;
    coldStartFixBuffer = [];

    commitSnapshot({
      ...snapshotState,
      route: stableRoute,
      startedAt: snapshotState.startedAt ?? stableRoute[0]?.timestamp ?? nextPoint.timestamp,
      distanceKm: Number((accumulatedDistanceMeters / 1000).toFixed(2)),
      elevationGainM: Math.round(accumulatedElevationGainMeters),
      currentPace: buildSmoothedCurrentPace(stableRoute, reliableSpeedMps, locationTimestampMs),
    });
    return;
  }

  coldStartFixBuffer = [];

  const excursionAnchorIndex = findColdStartExcursionAnchorIndex(snapshotState.route, nextPoint);
  if (excursionAnchorIndex !== null) {
    const nextRoute = [...snapshotState.route.slice(0, excursionAnchorIndex + 1), nextPoint];
    // 경로 재계산은 크레딧을 모른다 — 도로 얹지 않으면 화면꺼짐에 되찾은 거리가 여기서 지워진다.
    accumulatedDistanceMeters = sumObservedRouteDistanceMeters(nextRoute) + externalCreditMeters;
    accumulatedElevationGainMeters = calculateElevationGainM(nextRoute);
    lastCountedPoint = nextRoute[nextRoute.length - 1] ?? null;

    commitSnapshot({
      ...snapshotState,
      route: nextRoute,
      startedAt: snapshotState.startedAt ?? nextRoute[0]?.timestamp ?? nextPoint.timestamp,
      distanceKm: Number((accumulatedDistanceMeters / 1000).toFixed(2)),
      elevationGainM: Math.round(accumulatedElevationGainMeters),
      currentPace: buildSmoothedCurrentPace(nextRoute, reliableSpeedMps, locationTimestampMs),
    });
    return;
  }

  const segmentDistanceMeters = calculateDistanceBetweenPoints(previousPoint, nextPoint);
  const timeDelta = new Date(nextPoint.timestamp).getTime() - new Date(previousPoint.timestamp).getTime();

  if (timeDelta < MIN_LOCATION_TIME_DELTA_MS) {
    rgDiagLog(`[RG dist] DROP time dt=${timeDelta} seg=${segmentDistanceMeters.toFixed(1)}`);
    commitSnapshot({
      ...snapshotState,
      currentPace: buildSmoothedCurrentPace(snapshotState.route, reliableSpeedMps, locationTimestampMs),
    });
    return;
  }

  // 신호 소실 갭: 이 구간의 직선은 우리가 본 경로가 아니다 — 거리는 적립하지 않고 앵커만
  // 새 위치로 옮겨 이후부터 다시 적립한다. 속도 필터보다 먼저 와야 한다: 끊긴 시간이 길수록
  // 암묵 속도가 낮아져 아래 필터들은 이 구간을 정상 주행으로 오인한다.
  if (isSignalLossGapMs(timeDelta)) {
    const nextRoute = [...snapshotState.route, nextPoint];
    lastCountedPoint = nextPoint;
    accumulatedElevationGainMeters = calculateElevationGainM(nextRoute);
    rgDiagLog(`[RG dist] GAP no-credit dt=${timeDelta} chord=${segmentDistanceMeters.toFixed(1)} total=${(accumulatedDistanceMeters / 1000).toFixed(3)}`);
    commitSnapshot({
      ...snapshotState,
      route: nextRoute,
      startedAt: snapshotState.startedAt ?? nextPoint.timestamp,
      distanceKm: Number((accumulatedDistanceMeters / 1000).toFixed(2)),
      elevationGainM: Math.round(accumulatedElevationGainMeters),
      currentPace: buildSmoothedCurrentPace(nextRoute, reliableSpeedMps, locationTimestampMs),
    });
    return;
  }

  const segmentSpeedMps = segmentDistanceMeters / (timeDelta / 1000);
  const previousAccuracyM = normalizeAccuracyMeters(previousPoint.accuracyM);
  const worstAccuracyM = Math.max(previousAccuracyM ?? 0, accuracyM ?? 0);

  if (
    segmentDistanceMeters >= MIN_TELEPORT_FILTER_DISTANCE_METERS
    && segmentSpeedMps > MAX_REASONABLE_RUNNING_SPEED_MPS
  ) {
    commitSnapshot({
      ...snapshotState,
      currentPace: buildSmoothedCurrentPace(snapshotState.route, reliableSpeedMps, locationTimestampMs),
    });
    return;
  }

  if (
    segmentDistanceMeters > Math.max(MIN_TELEPORT_FILTER_DISTANCE_METERS, worstAccuracyM * 1.8)
    && segmentSpeedMps > 5.8
  ) {
    commitSnapshot({
      ...snapshotState,
      currentPace: buildSmoothedCurrentPace(snapshotState.route, reliableSpeedMps, locationTimestampMs),
    });
    return;
  }

  if (shouldIgnoreNoisySegment({
    segmentDistanceMeters,
    segmentSpeedMps,
    worstAccuracyM,
    reliableSpeedMps,
  })) {
    rgDiagLog(`[RG dist] DROP noise seg=${segmentDistanceMeters.toFixed(1)} worstAcc=${worstAccuracyM.toFixed(0)} spd=${segmentSpeedMps.toFixed(2)}`);
    commitSnapshot({
      ...snapshotState,
      currentPace: buildSmoothedCurrentPace(snapshotState.route, reliableSpeedMps, locationTimestampMs),
    });
    return;
  }

  const jitterAnchorIndex = findMidRunLateralJitterAnchorIndex(snapshotState.route, nextPoint);
  if (jitterAnchorIndex !== null) {
    // Collapse short side-to-side GPS jitter into the direct road segment instead of adding every wobble.
    const nextRoute = [...snapshotState.route.slice(0, jitterAnchorIndex + 1), nextPoint];
    // 경로 재계산은 크레딧을 모른다 — 도로 얹지 않으면 화면꺼짐에 되찾은 거리가 여기서 지워진다.
    accumulatedDistanceMeters = sumObservedRouteDistanceMeters(nextRoute) + externalCreditMeters;
    rgDiagLog(`[RG dist] COLLAPSE jitter seg=${segmentDistanceMeters.toFixed(1)} total=${(accumulatedDistanceMeters / 1000).toFixed(3)}`);
    accumulatedElevationGainMeters = calculateElevationGainM(nextRoute);
    lastCountedPoint = nextRoute[nextRoute.length - 1] ?? null;

    commitSnapshot({
      ...snapshotState,
      route: nextRoute,
      startedAt: snapshotState.startedAt ?? nextRoute[0]?.timestamp ?? nextPoint.timestamp,
      distanceKm: Number((accumulatedDistanceMeters / 1000).toFixed(2)),
      elevationGainM: Math.round(accumulatedElevationGainMeters),
      currentPace: buildSmoothedCurrentPace(nextRoute, reliableSpeedMps, locationTimestampMs),
    });
    return;
  }

  const distanceGateAnchorPoint = lastCountedPoint ?? previousPoint;
  if (lastCountedPoint === null) {
    lastCountedPoint = distanceGateAnchorPoint;
  }
  const distanceGateMeters = resolveDistanceGateMeters(worstAccuracyM);
  const distanceFromCountedMeters = calculateDistanceBetweenPoints(distanceGateAnchorPoint, nextPoint);
  const nextRoute = [...snapshotState.route, nextPoint];

  if (distanceFromCountedMeters < distanceGateMeters) {
    rgDiagLog(`[RG dist] GATE seg=${segmentDistanceMeters.toFixed(1)} distFromCounted=${distanceFromCountedMeters.toFixed(1)} gate=${distanceGateMeters.toFixed(1)} total=${(accumulatedDistanceMeters / 1000).toFixed(3)}`);
    commitSnapshot({
      ...snapshotState,
      route: nextRoute,
      startedAt: snapshotState.startedAt ?? nextPoint.timestamp,
      distanceKm: Number((accumulatedDistanceMeters / 1000).toFixed(2)),
      elevationGainM: Math.round(accumulatedElevationGainMeters),
      currentPace: buildSmoothedCurrentPace(nextRoute, reliableSpeedMps, locationTimestampMs),
    });
    return;
  }

  nextAccumulatedDistanceMeters += distanceFromCountedMeters;
  lastCountedPoint = nextPoint;
  rgDiagLog(`[RG dist] ADD seg=${segmentDistanceMeters.toFixed(1)} distFromCounted=${distanceFromCountedMeters.toFixed(1)} gate=${distanceGateMeters.toFixed(1)} acc=${accuracyM ?? -1} dt=${timeDelta} spd=${segmentSpeedMps.toFixed(2)} total=${(nextAccumulatedDistanceMeters / 1000).toFixed(3)}`);

  accumulatedDistanceMeters = nextAccumulatedDistanceMeters;
  // Elevation gain is ALWAYS a full-route recompute through the single shared reducer — the
  // incremental += is deleted so the incremental and recompute paths can never diverge (the EMA +
  // deadband are stateful over the whole series and cannot be reproduced by a per-segment add).
  accumulatedElevationGainMeters = calculateElevationGainM(nextRoute);
  commitSnapshot({
    ...snapshotState,
    route: nextRoute,
    startedAt: snapshotState.startedAt ?? nextPoint.timestamp,
    distanceKm: Number((accumulatedDistanceMeters / 1000).toFixed(2)),
    elevationGainM: Math.round(accumulatedElevationGainMeters),
    currentPace: buildSmoothedCurrentPace(nextRoute, reliableSpeedMps, locationTimestampMs),
  });
}
