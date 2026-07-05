import type * as Location from 'expo-location';
import type { RunRoutePoint } from '@/domain';
import type { BackgroundRunTrackingSnapshot } from '@/features/runs/tracking/background';
import { calculateDistanceBetweenPoints } from '@/features/runs/tracking';

export type OfficialStartBaseline = {
  matchId: string;
  distanceKm: number;
  elapsedSeconds: number;
  routeStartIndex: number;
  routeStartPoint: RunRoutePoint | null;
  startedAt: string;
};

function parseRoutePointMs(point?: RunRoutePoint) {
  const parsedMs = point ? new Date(point.timestamp).getTime() : NaN;
  return Number.isFinite(parsedMs) ? parsedMs : null;
}

function interpolateRoutePoint(start: RunRoutePoint, end: RunRoutePoint, targetMs: number): RunRoutePoint {
  const startMs = parseRoutePointMs(start);
  const endMs = parseRoutePointMs(end);
  const ratio = startMs === null || endMs === null || endMs <= startMs
    ? 0
    : Math.max(0, Math.min(1, (targetMs - startMs) / (endMs - startMs)));

  return {
    latitude: start.latitude + (end.latitude - start.latitude) * ratio,
    longitude: start.longitude + (end.longitude - start.longitude) * ratio,
    altitude: typeof start.altitude === 'number' && typeof end.altitude === 'number'
      ? Number((start.altitude + (end.altitude - start.altitude) * ratio).toFixed(1))
      : start.altitude ?? end.altitude ?? null,
    timestamp: new Date(targetMs).toISOString(),
  };
}

function calculateRouteDistanceMeters(route: RunRoutePoint[]) {
  let totalDistanceMeters = 0;

  for (let index = 1; index < route.length; index += 1) {
    totalDistanceMeters += calculateDistanceBetweenPoints(route[index - 1], route[index]);
  }

  return totalDistanceMeters;
}

export function getTrackingSnapshotElapsedSeconds(snapshot: BackgroundRunTrackingSnapshot, nowMs = Date.now()) {
  if (!snapshot.startedAt) {
    return 0;
  }

  const startedAtMs = new Date(snapshot.startedAt).getTime();

  if (Number.isNaN(startedAtMs)) {
    return 0;
  }

  const referenceMs = snapshot.status === 'paused' && snapshot.pausedAt
    ? new Date(snapshot.pausedAt).getTime()
    : nowMs;

  if (Number.isNaN(referenceMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((referenceMs - startedAtMs - snapshot.accumulatedPausedMs) / 1000));
}

export function buildOfficialStartBaseline(
  snapshot: BackgroundRunTrackingSnapshot,
  matchId: string,
  officialStartAt: string,
): OfficialStartBaseline {
  const officialStartMs = new Date(officialStartAt).getTime();
  const safeOfficialStartMs = Number.isFinite(officialStartMs) ? officialStartMs : Date.now();
  const route = snapshot.route;

  if (route.length === 0) {
    return {
      matchId,
      distanceKm: 0,
      elapsedSeconds: getTrackingSnapshotElapsedSeconds(snapshot, safeOfficialStartMs),
      routeStartIndex: 0,
      routeStartPoint: null,
      startedAt: new Date(safeOfficialStartMs).toISOString(),
    };
  }

  const firstAfterStartIndex = route.findIndex((point) => {
    const pointMs = parseRoutePointMs(point);
    return pointMs !== null && pointMs >= safeOfficialStartMs;
  });

  if (firstAfterStartIndex === -1) {
    const lastPoint = route[route.length - 1];
    return {
      matchId,
      distanceKm: snapshot.distanceKm,
      elapsedSeconds: getTrackingSnapshotElapsedSeconds(snapshot, safeOfficialStartMs),
      routeStartIndex: route.length,
      routeStartPoint: { ...lastPoint, timestamp: new Date(safeOfficialStartMs).toISOString() },
      startedAt: new Date(safeOfficialStartMs).toISOString(),
    };
  }

  if (firstAfterStartIndex === 0) {
    return {
      matchId,
      distanceKm: 0,
      elapsedSeconds: getTrackingSnapshotElapsedSeconds(snapshot, safeOfficialStartMs),
      routeStartIndex: 0,
      routeStartPoint: route[0],
      startedAt: new Date(safeOfficialStartMs).toISOString(),
    };
  }

  const previousPoint = route[firstAfterStartIndex - 1];
  const nextPoint = route[firstAfterStartIndex];
  const startPoint = interpolateRoutePoint(previousPoint, nextPoint, safeOfficialStartMs);
  const baselineRoute = [...route.slice(0, firstAfterStartIndex), startPoint];

  return {
    matchId,
    distanceKm: Number((calculateRouteDistanceMeters(baselineRoute) / 1000).toFixed(3)),
    elapsedSeconds: getTrackingSnapshotElapsedSeconds(snapshot, safeOfficialStartMs),
    routeStartIndex: firstAfterStartIndex,
    routeStartPoint: startPoint,
    startedAt: new Date(safeOfficialStartMs).toISOString(),
  };
}

export function buildRouteFromOfficialStart(snapshot: BackgroundRunTrackingSnapshot, baseline: OfficialStartBaseline) {
  const routeTail = snapshot.route.slice(Math.max(0, baseline.routeStartIndex));

  if (!baseline.routeStartPoint) {
    return routeTail;
  }

  if (routeTail[0]?.timestamp === baseline.routeStartPoint.timestamp) {
    return routeTail;
  }

  return [baseline.routeStartPoint, ...routeTail];
}

export function buildRoutePoint(location: Location.LocationObject): RunRoutePoint {
  // Vertical accuracy feeds the elevation-gain accuracy gate; omit the key when the device does not
  // report a usable (non-negative, finite) value so the reducer's route-level accuracy detection is
  // not fooled into gating iOS / old routes that never carry it.
  const rawAltitudeAccuracy = location.coords.altitudeAccuracy;
  const altitudeAccuracyM = typeof rawAltitudeAccuracy === 'number'
    && Number.isFinite(rawAltitudeAccuracy)
    && rawAltitudeAccuracy >= 0
    ? Number(rawAltitudeAccuracy.toFixed(1))
    : null;

  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    altitude: typeof location.coords.altitude === 'number' ? Number(location.coords.altitude.toFixed(1)) : null,
    ...(altitudeAccuracyM !== null ? { altitudeAccuracyM } : {}),
    timestamp: new Date(location.timestamp).toISOString(),
  };
}

export function formatMetricDistance(distanceKm: number) {
  return `${distanceKm.toFixed(2)}km`;
}

export function formatElevation(elevationGainM: number) {
  return `${Math.round(elevationGainM)}m`;
}

export function formatCadence(cadenceSpm: number | null) {
  return cadenceSpm ? `${cadenceSpm}spm` : '--';
}

export function buildLiveShareLabelFromAddress(address?: Location.LocationGeocodedAddress | null) {
  if (!address) {
    return '현재 위치 근처';
  }

  const parts = [
    address.district,
    address.street,
    address.city,
    address.region,
    address.name,
  ].filter(Boolean);

  return parts.length ? `${parts[0]} 근처` : '현재 위치 근처';
}

export function buildLiveShareFallbackLabel() {
  return '현재 위치 근처';
}
