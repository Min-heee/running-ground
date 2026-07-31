import * as Location from 'expo-location';
import type { RunRoutePoint } from '@/domain';
import { calculateDistanceBetweenPoints } from '@/features/runs/tracking';

export const CURRENT_PACE_SMOOTHING_WINDOW_MS = 35000;
export const CURRENT_PACE_MIN_WINDOW_MS = 12000;
export const CURRENT_PACE_MIN_DISTANCE_METERS = 28;
export const CURRENT_PACE_STALE_AFTER_MS = 14000;
export const MAX_TRACKING_ACCURACY_METERS = 40;
export const MAX_REASONABLE_RUNNING_SPEED_MPS = 8.5;
export const MIN_RELIABLE_RUNNING_SPEED_MPS = 0.7;
export const MIN_LOCATION_TIME_DELTA_MS = 900;
export const MIN_MOVEMENT_DISTANCE_METERS = 3.0;
export const MAX_LOCATION_AGE_MS = 15000;
export const MAX_FUTURE_LOCATION_MS = 3000;
export const MIN_TELEPORT_FILTER_DISTANCE_METERS = 35;
// 신호 소실 구간 무적립 (오너 2026-07-31, 나이키런 대조 3.0km vs 3.8km 사건).
// 고가·터널에서 GPS가 죽었다 수백 m 떨어진 곳에서 다시 잡히면, 그 사이 직선(chord)의
// 암묵 속도는 '거리 ÷ 끊긴 시간'이라 달리기 속도처럼 낮아져 순간이동 필터(속도 기준)를
// 전부 통과하고 직선 거리가 통째로 적립됐다 — 지도의 쭉 뻗은 직선과 +0.8km의 정체.
// 1Hz 샘플링에서 이 시간 넘게 유효 픽스가 없었다면 실제 신호 소실이다: 그 구간은 우리가
// 보지 못한 길이므로 적립하지 않는다(나이키와 같은 정책). 짧은 다리/건물 밑 끊김(≤30s)은
// 지금처럼 직선으로 적립된다 — 그 정도 chord는 거의 항상 실제 주행이다.
// 부수 효과: GPS 차단된 차량 이동(느린 버스 등)이 '그럴듯한 속도'로 적립되던 치팅 구멍도 막힌다.
export const MAX_CREDITABLE_FIX_GAP_MS = 30_000;

export function isSignalLossGapMs(timeDeltaMs: number) {
  return timeDeltaMs > MAX_CREDITABLE_FIX_GAP_MS;
}
export const STATIONARY_SPEED_MPS = 0.9;
export const POOR_ACCURACY_METERS = 25;
export const MIN_REASONABLE_PACE_SECONDS_PER_KM = 150;
export const MAX_REASONABLE_PACE_SECONDS_PER_KM = 1200;
export const COLD_START_STABLE_FIX_COUNT = 3;
export const COLD_START_MAX_STABLE_ACCURACY_METERS = 20;
export const COLD_START_MAX_STABLE_CLUSTER_RADIUS_METERS = 30;
export const COLD_START_MAX_STABLE_WINDOW_MS = 10_000;
export const COLD_START_MAX_BUFFER_FIXES = 8;
export const COLD_START_EXCURSION_WINDOW_MS = 45_000;
export const COLD_START_EXCURSION_LOOKBACK_POINTS = 5;
export const COLD_START_EXCURSION_DIRECT_RADIUS_METERS = 22;
export const COLD_START_EXCURSION_MIN_PATH_METERS = 24;
export const COLD_START_EXCURSION_MIN_EXTRA_METERS = 12;
export const COLD_START_EXCURSION_MIN_INTERNAL_POINTS = 2;
export const MID_RUN_LATERAL_JITTER_LOOKBACK_POINTS = 5;
export const MID_RUN_LATERAL_JITTER_MAX_WINDOW_MS = 18_000;
export const MID_RUN_LATERAL_JITTER_MIN_DIRECT_METERS = 22;
export const MID_RUN_LATERAL_JITTER_MIN_PATH_METERS = 45;
export const MID_RUN_LATERAL_JITTER_MIN_EXTRA_METERS = 14;
export const MID_RUN_LATERAL_JITTER_MIN_EXTRA_RATIO = 0.24;
export const MID_RUN_LATERAL_JITTER_MIN_SIDE_METERS = 6;
export const DISTANCE_GATE_BASE_METERS = 3.0;
export const DISTANCE_GATE_ACCURACY_SCALE = 0.15;
// CROSS-DEVICE PARITY CAP for every ACCURACY-SCALED threshold (distance gate, dynamic min-movement,
// stationary noise radius, poor-accuracy noise radius, mid-run jitter thresholds). Vendor accuracy
// ESTIMATES differ: a Galaxy single-band chip reports 10-20m where an iPhone multi-band chip reports
// 3-8m for fixes of comparable real quality (both nominally 1-sigma, but the estimators are
// calibrated differently). Uncapped, that estimate difference widens the Galaxy's gates relative to
// the iPhone's — coarser counted chords, more dropped slow segments — amplifying a mere chip
// REPORTING difference into a measured-DISTANCE divergence. Capping the accuracy value fed to the
// scaled terms at 15m bounds how far any vendor's estimate can widen a threshold.
// NOTE: the hard REJECT threshold (accuracyM > MAX_TRACKING_ACCURACY_METERS = 40 drops the fix) is
// intentionally UNCAPPED and unchanged — genuinely terrible fixes must still be discarded outright.
export const ACCURACY_SCALE_CAP_METERS = 15;

// The accuracy value to use wherever accuracy SCALES a threshold (never for hard-reject comparisons).
export function capAccuracyForThresholdScaling(accuracyM: number) {
  return Math.min(Math.max(0, accuracyM), ACCURACY_SCALE_CAP_METERS);
}

export function normalizeAccuracyMeters(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Number(value.toFixed(1))
    : null;
}

export function normalizeReliableSpeedMps(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  if (value < MIN_RELIABLE_RUNNING_SPEED_MPS || value > MAX_REASONABLE_RUNNING_SPEED_MPS) {
    return null;
  }

  return value;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function resolveLocationTimestampMs(location: Location.LocationObject) {
  const timestampMs = typeof location.timestamp === 'number' ? location.timestamp : NaN;

  if (!Number.isFinite(timestampMs)) {
    return null;
  }

  const nowMs = Date.now();
  if (nowMs - timestampMs > MAX_LOCATION_AGE_MS || timestampMs - nowMs > MAX_FUTURE_LOCATION_MS) {
    return null;
  }

  return timestampMs;
}

export function buildRoutePoint(location: Location.LocationObject): RunRoutePoint {
  const accuracyM = normalizeAccuracyMeters(location.coords.accuracy);
  // Vertical accuracy drives the elevation-gain accuracy gate. Reuse the same non-negative-finite
  // guard as horizontal accuracy; when the device does not report it the key is omitted, so the
  // elevation reducer's route-level "does this route report accuracy at all" detection stays honest.
  const altitudeAccuracyM = normalizeAccuracyMeters(location.coords.altitudeAccuracy);

  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    altitude: typeof location.coords.altitude === 'number' ? Number(location.coords.altitude.toFixed(1)) : null,
    ...(altitudeAccuracyM !== null ? { altitudeAccuracyM } : {}),
    ...(accuracyM !== null ? { accuracyM } : {}),
    timestamp: new Date(location.timestamp).toISOString(),
  };
}

export function resolveRoutePointTimestampMs(point: RunRoutePoint) {
  const timestampMs = new Date(point.timestamp).getTime();
  return Number.isNaN(timestampMs) ? null : timestampMs;
}

export function buildFallbackPaceSecondsPerKm(speedMps?: number | null) {
  const reliableFallbackSpeedMps = normalizeReliableSpeedMps(speedMps);

  if (reliableFallbackSpeedMps === null) {
    return null;
  }

  return 1000 / reliableFallbackSpeedMps;
}

export function resolveDynamicMinMovementMeters(worstAccuracyM: number) {
  // Accuracy-scaled term uses the capped accuracy (see ACCURACY_SCALE_CAP_METERS): an inflated
  // vendor estimate may not raise the min-movement floor beyond what a 15m fix would.
  return Math.max(
    MIN_MOVEMENT_DISTANCE_METERS,
    Math.min(4.5, capAccuracyForThresholdScaling(worstAccuracyM) * 0.1),
  );
}

export function resolveDistanceGateMeters(worstAccuracyM: number) {
  // Accuracy-scaled term uses the capped accuracy (see ACCURACY_SCALE_CAP_METERS): the gate tops out
  // at 3.0 + 15 * 0.15 = 5.25m no matter how pessimistic the vendor's accuracy estimate is, so both
  // devices bank comparably fine chords on the same route.
  return DISTANCE_GATE_BASE_METERS
    + capAccuracyForThresholdScaling(worstAccuracyM) * DISTANCE_GATE_ACCURACY_SCALE;
}

export function shouldIgnoreNoisySegment({
  segmentDistanceMeters,
  segmentSpeedMps,
  worstAccuracyM,
  reliableSpeedMps,
}: {
  segmentDistanceMeters: number;
  segmentSpeedMps: number;
  worstAccuracyM: number;
  reliableSpeedMps: number | null;
}) {
  if (segmentDistanceMeters < resolveDynamicMinMovementMeters(worstAccuracyM)) {
    return true;
  }

  // The poor-accuracy radius SCALES with accuracy, so it uses the capped value: an inflated
  // vendor accuracy estimate (Galaxy 10-20m vs iPhone 3-8m for comparable fixes) must not widen
  // the drop radius and swallow more slow real movement on one device than the other. The
  // CLASSIFICATION comparison (worstAccuracyM >= POOR_ACCURACY_METERS) intentionally stays on the
  // raw value — it detects poor fixes, it does not scale a threshold.
  const scaledAccuracyM = capAccuracyForThresholdScaling(worstAccuracyM);

  const looksStationary = (
    (reliableSpeedMps !== null && reliableSpeedMps < STATIONARY_SPEED_MPS)
    || segmentSpeedMps < STATIONARY_SPEED_MPS
  );
  // STATIONARY radius deliberately EXEMPT from the accuracy cap: it only ever drops segments
  // already classified stationary (sub-0.9 m/s), so it cannot swallow real running — but with
  // Android now receiving the full 1 Hz drift stream (no more 4 m OS pre-gate), red-light
  // multipath wander at acc 15-20m needs the full raw-accuracy suppression radius or standing
  // still slowly accrues phantom meters on the noisier device.
  const stationaryNoiseRadiusMeters = Math.max(4, Math.min(12, worstAccuracyM * 0.35));

  if (looksStationary && segmentDistanceMeters < stationaryNoiseRadiusMeters) {
    return true;
  }

  const hasPoorAccuracy = worstAccuracyM >= POOR_ACCURACY_METERS;
  const poorAccuracyNoiseRadiusMeters = Math.min(12, scaledAccuracyM * 0.25);

  return hasPoorAccuracy
    && segmentSpeedMps < 1.4
    && segmentDistanceMeters < poorAccuracyNoiseRadiusMeters;
}

export function calculateRouteWindowDistanceMeters(route: RunRoutePoint[]) {
  let distanceMeters = 0;
  for (let index = 1; index < route.length; index += 1) {
    distanceMeters += calculateDistanceBetweenPoints(route[index - 1], route[index]);
  }

  return distanceMeters;
}

function hasStableColdStartAccuracy(point: RunRoutePoint) {
  const accuracyM = normalizeAccuracyMeters(point.accuracyM);
  return accuracyM === null || accuracyM <= COLD_START_MAX_STABLE_ACCURACY_METERS;
}

export function buildStableColdStartRouteCandidate(points: RunRoutePoint[]) {
  if (points.length < COLD_START_STABLE_FIX_COUNT) {
    return null;
  }

  const recentPoints = points.slice(-COLD_START_STABLE_FIX_COUNT);
  const firstTimestampMs = resolveRoutePointTimestampMs(recentPoints[0]);
  const lastTimestampMs = resolveRoutePointTimestampMs(recentPoints[recentPoints.length - 1]);

  if (
    firstTimestampMs === null
    || lastTimestampMs === null
    || lastTimestampMs <= firstTimestampMs
    || lastTimestampMs - firstTimestampMs > COLD_START_MAX_STABLE_WINDOW_MS
  ) {
    return null;
  }

  if (!recentPoints.every(hasStableColdStartAccuracy)) {
    return null;
  }

  let maxPairDistanceMeters = 0;
  for (let leftIndex = 0; leftIndex < recentPoints.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < recentPoints.length; rightIndex += 1) {
      maxPairDistanceMeters = Math.max(
        maxPairDistanceMeters,
        calculateDistanceBetweenPoints(recentPoints[leftIndex], recentPoints[rightIndex]),
      );
    }
  }

  return maxPairDistanceMeters <= COLD_START_MAX_STABLE_CLUSTER_RADIUS_METERS
    ? recentPoints
    : null;
}

export function trimColdStartFixBuffer(points: RunRoutePoint[]) {
  if (points.length <= COLD_START_MAX_BUFFER_FIXES) {
    return points;
  }

  return points.slice(-COLD_START_MAX_BUFFER_FIXES);
}

export function findColdStartExcursionAnchorIndex(route: RunRoutePoint[], nextPoint: RunRoutePoint) {
  if (route.length < 2) {
    return null;
  }

  const firstTimestampMs = resolveRoutePointTimestampMs(route[0]);
  const nextTimestampMs = resolveRoutePointTimestampMs(nextPoint);

  if (
    firstTimestampMs === null
    || nextTimestampMs === null
    || nextTimestampMs - firstTimestampMs > COLD_START_EXCURSION_WINDOW_MS
  ) {
    return null;
  }

  const minAnchorIndex = Math.max(0, route.length - COLD_START_EXCURSION_LOOKBACK_POINTS);

  for (let anchorIndex = route.length - 2; anchorIndex >= minAnchorIndex; anchorIndex -= 1) {
    const anchorPoint = route[anchorIndex];
    const directDistanceMeters = calculateDistanceBetweenPoints(anchorPoint, nextPoint);

    if (directDistanceMeters > COLD_START_EXCURSION_DIRECT_RADIUS_METERS) {
      continue;
    }

    const candidatePath = [...route.slice(anchorIndex), nextPoint];
    const internalPointCount = candidatePath.length - 2;
    const candidatePathDistanceMeters = calculateRouteWindowDistanceMeters(candidatePath);

    if (
      internalPointCount >= COLD_START_EXCURSION_MIN_INTERNAL_POINTS
      && candidatePathDistanceMeters >= COLD_START_EXCURSION_MIN_PATH_METERS
      && candidatePathDistanceMeters - directDistanceMeters >= COLD_START_EXCURSION_MIN_EXTRA_METERS
    ) {
      return anchorIndex;
    }
  }

  return null;
}

function calculateLocalVectorMeters(origin: RunRoutePoint, point: RunRoutePoint) {
  const averageLatitudeRadians = ((origin.latitude + point.latitude) / 2) * Math.PI / 180;
  const metersPerLatitudeDegree = 111_320;
  const metersPerLongitudeDegree = metersPerLatitudeDegree * Math.cos(averageLatitudeRadians);

  return {
    east: (point.longitude - origin.longitude) * metersPerLongitudeDegree,
    north: (point.latitude - origin.latitude) * metersPerLatitudeDegree,
  };
}

function calculateSignedLateralDistanceMeters(
  anchorPoint: RunRoutePoint,
  endPoint: RunRoutePoint,
  candidatePoint: RunRoutePoint,
) {
  const endVector = calculateLocalVectorMeters(anchorPoint, endPoint);
  const candidateVector = calculateLocalVectorMeters(anchorPoint, candidatePoint);
  const directMagnitude = Math.hypot(endVector.east, endVector.north);

  if (directMagnitude <= 0) {
    return 0;
  }

  return (
    endVector.east * candidateVector.north
    - endVector.north * candidateVector.east
  ) / directMagnitude;
}

function findOpposingLateralJitterSides(
  anchorPoint: RunRoutePoint,
  endPoint: RunRoutePoint,
  candidatePoints: RunRoutePoint[],
  lateralThresholdMeters: number,
) {
  let hasPositiveSide = false;
  let hasNegativeSide = false;

  for (const point of candidatePoints) {
    const signedLateralMeters = calculateSignedLateralDistanceMeters(anchorPoint, endPoint, point);

    if (signedLateralMeters >= lateralThresholdMeters) {
      hasPositiveSide = true;
    }

    if (signedLateralMeters <= -lateralThresholdMeters) {
      hasNegativeSide = true;
    }

    if (hasPositiveSide && hasNegativeSide) {
      return true;
    }
  }

  return false;
}

function resolveRouteWindowMaxAccuracyMeters(points: RunRoutePoint[]) {
  return points.reduce((maxAccuracyM, point) => {
    const accuracyM = normalizeAccuracyMeters(point.accuracyM);
    return Math.max(maxAccuracyM, accuracyM ?? 0);
  }, 0);
}

export function findMidRunLateralJitterAnchorIndex(route: RunRoutePoint[], nextPoint: RunRoutePoint) {
  if (route.length < 3) {
    return null;
  }

  const nextTimestampMs = resolveRoutePointTimestampMs(nextPoint);

  if (nextTimestampMs === null) {
    return null;
  }

  const minAnchorIndex = Math.max(0, route.length - MID_RUN_LATERAL_JITTER_LOOKBACK_POINTS);

  for (let anchorIndex = route.length - 3; anchorIndex >= minAnchorIndex; anchorIndex -= 1) {
    const anchorPoint = route[anchorIndex];
    const anchorTimestampMs = resolveRoutePointTimestampMs(anchorPoint);

    if (
      anchorTimestampMs === null
      || nextTimestampMs <= anchorTimestampMs
      || nextTimestampMs - anchorTimestampMs > MID_RUN_LATERAL_JITTER_MAX_WINDOW_MS
    ) {
      continue;
    }

    const candidatePath = [...route.slice(anchorIndex), nextPoint];
    const internalPoints = candidatePath.slice(1, -1);

    if (internalPoints.length < 2) {
      continue;
    }

    const directDistanceMeters = calculateDistanceBetweenPoints(anchorPoint, nextPoint);
    const candidatePathDistanceMeters = calculateRouteWindowDistanceMeters(candidatePath);

    if (
      directDistanceMeters < MID_RUN_LATERAL_JITTER_MIN_DIRECT_METERS
      || candidatePathDistanceMeters < MID_RUN_LATERAL_JITTER_MIN_PATH_METERS
    ) {
      continue;
    }

    // Accuracy-scaled thresholds use the capped accuracy (ACCURACY_SCALE_CAP_METERS): the jitter
    // collapse must engage equally on both devices for fixes of comparable real quality, instead of
    // being deactivated on the device whose vendor reports pessimistic accuracy estimates.
    const maxAccuracyM = capAccuracyForThresholdScaling(
      resolveRouteWindowMaxAccuracyMeters(candidatePath),
    );
    const extraDistanceMeters = candidatePathDistanceMeters - directDistanceMeters;
    const minExtraDistanceMeters = Math.max(
      MID_RUN_LATERAL_JITTER_MIN_EXTRA_METERS,
      maxAccuracyM * 1.4,
    );

    if (
      extraDistanceMeters < minExtraDistanceMeters
      || extraDistanceMeters / candidatePathDistanceMeters < MID_RUN_LATERAL_JITTER_MIN_EXTRA_RATIO
    ) {
      continue;
    }

    const lateralThresholdMeters = Math.max(
      MID_RUN_LATERAL_JITTER_MIN_SIDE_METERS,
      Math.min(14, maxAccuracyM * 0.75),
    );

    if (findOpposingLateralJitterSides(anchorPoint, nextPoint, internalPoints, lateralThresholdMeters)) {
      return anchorIndex;
    }
  }

  return null;
}
