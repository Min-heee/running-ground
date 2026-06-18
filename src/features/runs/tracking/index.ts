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

export function calculateElevationGainM(route: RunRoutePoint[]) {
  if (route.length < 2) {
    return 0;
  }

  let gainMeters = 0;

  for (let index = 1; index < route.length; index += 1) {
    const previousAltitude = route[index - 1].altitude;
    const currentAltitude = route[index].altitude;

    if (typeof previousAltitude !== 'number' || typeof currentAltitude !== 'number') {
      continue;
    }

    const altitudeDelta = currentAltitude - previousAltitude;

    if (altitudeDelta > 0.8) {
      gainMeters += altitudeDelta;
    }
  }

  return Math.round(gainMeters);
}

export function calculateCadenceSpm(totalSteps: number, elapsedSeconds: number) {
  if (!Number.isFinite(totalSteps) || totalSteps <= 0 || elapsedSeconds <= 0) {
    return null;
  }

  return Math.round((totalSteps / elapsedSeconds) * 60);
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
