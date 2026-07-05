import { RunRoutePoint } from '@/domain';

export type MapCoordinate = Pick<RunRoutePoint, 'latitude' | 'longitude'>;

export type RunMapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const EARTH_RADIUS_METERS = 6371000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatPaceFromSecondsPerKm(secondsPerKm?: number | null) {
  if (!secondsPerKm || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) {
    return '--:--/km';
  }

  const roundedSeconds = Math.round(secondsPerKm);
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}/km`;
}

export function formatPaceFromSpeedMps(speedMps?: number | null) {
  if (!speedMps || !Number.isFinite(speedMps) || speedMps <= 0.4) {
    return '--:--/km';
  }

  return formatPaceFromSecondsPerKm(1000 / speedMps);
}

export function calculateDistanceBetweenPoints(start: MapCoordinate, end: MapCoordinate) {
  const latitudeDelta = toRadians(end.latitude - start.latitude);
  const longitudeDelta = toRadians(end.longitude - start.longitude);
  const startLatitude = toRadians(start.latitude);
  const endLatitude = toRadians(end.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2)
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

// --- Elevation gain: ONE shared stateful whole-route reducer (single source of truth) ----------
// Raw GPS altitude is noisy (Android unfused GNSS reports ±10-40m of vertical wobble on flat
// ground; the old bare `delta > 0.8` gate filtered none of it and fabricated hundreds of meters).
// The filter is three parts, applied over a SMOOTHED altitude series, with NO Platform.OS branch —
// the accuracy gate self-adapts (Android's poor altitudeAccuracy excludes its bad samples; iOS's
// good values pass):
//   (1) altitude-accuracy gate: skip a sample whose vertical accuracy is missing-on-a-device-that-
//       otherwise-reports OR worse than MAX_RELIABLE_ALTITUDE_ACCURACY_M. When the WHOLE route never
//       reports accuracy (iOS / older saved routes), the gate is disabled so those never regress.
//   (2) EMA smoothing (alpha = ELEVATION_EMA_ALPHA) kills the per-sample sawtooth.
//   (3) deadband: only commit gain once the smoothed altitude rises ELEVATION_DEADBAND_M above the
//       last committed altitude, then advance the committed altitude.
export const MAX_RELIABLE_ALTITUDE_ACCURACY_M = 8;
export const ELEVATION_EMA_ALPHA = 0.3;
export const ELEVATION_DEADBAND_M = 2.0;

function routeReportsAltitudeAccuracy(route: RunRoutePoint[]) {
  return route.some((point) => typeof point.altitudeAccuracyM === 'number');
}

// Whether this sample's vertical accuracy is good enough to trust its altitude. Only meaningful
// when the route reports accuracy somewhere (routeHasAccuracy); otherwise the gate is disabled and
// every sample with a numeric altitude is accepted (falls through to EMA + deadband).
function hasReliableAltitude(point: RunRoutePoint, routeHasAccuracy: boolean) {
  if (typeof point.altitude !== 'number') {
    return false;
  }

  if (!routeHasAccuracy) {
    return true;
  }

  const altitudeAccuracyM = point.altitudeAccuracyM;
  if (typeof altitudeAccuracyM !== 'number') {
    // A device that reports accuracy elsewhere but not here → treat this sample as untrustworthy.
    return false;
  }

  return altitudeAccuracyM <= MAX_RELIABLE_ALTITUDE_ACCURACY_M;
}

export function calculateElevationGainM(route: RunRoutePoint[]) {
  if (route.length < 2) {
    return 0;
  }

  const routeHasAccuracy = routeReportsAltitudeAccuracy(route);

  let gainMeters = 0;
  let emaAltitude: number | null = null;
  let committedAltitude: number | null = null;

  for (let index = 0; index < route.length; index += 1) {
    const point = route[index];

    // Accuracy gate: an untrustworthy sample is skipped entirely — it must NOT poison the EMA or
    // move the committed altitude, so the smoothed series continues from the last good sample.
    if (!hasReliableAltitude(point, routeHasAccuracy)) {
      continue;
    }

    const rawAltitude = point.altitude as number;

    if (emaAltitude === null) {
      emaAltitude = rawAltitude;
      committedAltitude = rawAltitude;
      continue;
    }

    emaAltitude += ELEVATION_EMA_ALPHA * (rawAltitude - emaAltitude);

    if (committedAltitude !== null && emaAltitude - committedAltitude >= ELEVATION_DEADBAND_M) {
      gainMeters += emaAltitude - committedAltitude;
      committedAltitude = emaAltitude;
    }
  }

  return Math.round(gainMeters);
}

// A run past a minute that computes to fewer than this is not a slow jog — it's a dead/denied
// step sensor (e.g. Android with ACTIVITY_RECOGNITION never granted delivered ~81 steps for a
// ~27min run → ~3spm). Below the floor we return null so the record renders an honest '--'
// instead of a bogus 3spm. A real jog sits at 120-180spm, so this never nulls a genuine run.
export const MIN_PLAUSIBLE_CADENCE_SPM = 30;
// Only apply the floor once the run is long enough that no human could legitimately be under it.
// A 60s sprint-start (e.g. 20 steps in 20s = 60spm, or an even shorter burst) must not be nulled,
// so the floor is gated on elapsedSeconds > this.
export const CADENCE_FLOOR_MIN_ELAPSED_SECONDS = 60;

export function calculateCadenceSpm(totalSteps: number, elapsedSeconds: number) {
  if (!Number.isFinite(totalSteps) || totalSteps <= 0 || elapsedSeconds <= 0) {
    return null;
  }

  const cadenceSpm = Math.round((totalSteps / elapsedSeconds) * 60);

  // Plausibility floor: an implausibly low cadence on a run longer than a minute means the step
  // sensor is dead/denied, not that the runner is slow. Hide it (null → '--') rather than saving 3spm.
  if (elapsedSeconds > CADENCE_FLOOR_MIN_ELAPSED_SECONDS && cadenceSpm < MIN_PLAUSIBLE_CADENCE_SPM) {
    return null;
  }

  return cadenceSpm;
}

export function buildRunDateFromTimestamp(timestamp: string) {
  return timestamp.slice(0, 10);
}

// Raw cumulative average pace — NO movement floor. Use for a FINISHED/SAVED run, whose final
// distance is real even when short (e.g. an allowed short-forfeit save), so it must show its
// true pace rather than a placeholder.
export function buildAveragePaceForFinishedRun(distanceKm: number, elapsedSeconds: number) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || elapsedSeconds <= 0) {
    return '--:--/km';
  }

  return formatPaceFromSecondsPerKm(elapsedSeconds / distanceKm);
}

// LIVE display floor: while stationary a runner still accrues ~50m of cold-start GPS jitter
// (#182) as the slot-anchored elapsed keeps climbing, so a raw ratio shows a misleading ~6:xx
// that then inflates toward 11:xx. Suppress the LIVE average pace until there is real movement
// past the floor (well below any real run, which is >= 0.5km). The finished/saved record uses
// buildAveragePaceForFinishedRun and is unaffected.
export const MIN_LIVE_AVERAGE_PACE_DISTANCE_KM = 0.1;

export function buildAveragePace(distanceKm: number, elapsedSeconds: number) {
  if (!Number.isFinite(distanceKm) || distanceKm < MIN_LIVE_AVERAGE_PACE_DISTANCE_KM) {
    return '--:--/km';
  }

  return buildAveragePaceForFinishedRun(distanceKm, elapsedSeconds);
}

export function getMapRegion(coordinates: MapCoordinate[]): RunMapRegion | null {
  if (!coordinates.length) {
    return null;
  }

  const latitudes = coordinates.map((point) => point.latitude);
  const longitudes = coordinates.map((point) => point.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max((maxLatitude - minLatitude) * 1.6, 0.008),
    longitudeDelta: Math.max((maxLongitude - minLongitude) * 1.6, 0.008),
  };
}

export function getRunMapRegion(route: RunRoutePoint[]) {
  return getMapRegion(route);
}
