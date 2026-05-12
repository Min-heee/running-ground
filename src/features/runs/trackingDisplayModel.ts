import type { RunRoutePoint } from '@/domain/types';
import type { BackgroundRunTrackingSnapshot } from '@/features/runs/backgroundTracking';
import {
  buildRouteFromOfficialStart,
  type OfficialStartBaseline,
} from '@/features/runs/trackingSession';
import { calculateElevationGainM } from '@/features/runs/tracking';

export type DisplayedTrackingSnapshot = {
  route: RunRoutePoint[];
  distanceKm: number;
  elevationGainM: number;
  currentPace: string;
  elapsedSeconds: number;
  startedAt: string | null;
};

export function buildDisplayedTrackingSnapshot({
  snapshot,
  rawElapsedSeconds,
  officialStartBaseline,
  hasPreStartWarmup,
  startNoiseGraceSeconds,
  startNoiseGraceKm,
}: {
  snapshot: BackgroundRunTrackingSnapshot;
  rawElapsedSeconds: number;
  officialStartBaseline: OfficialStartBaseline | null;
  hasPreStartWarmup: boolean;
  startNoiseGraceSeconds: number;
  startNoiseGraceKm: number;
}): DisplayedTrackingSnapshot {
  if (officialStartBaseline) {
    const adjustedRoute = buildRouteFromOfficialStart(snapshot, officialStartBaseline);
    const adjustedElapsedSeconds = Math.max(0, rawElapsedSeconds - officialStartBaseline.elapsedSeconds);
    const adjustedDistanceKm = Number(Math.max(0, snapshot.distanceKm - officialStartBaseline.distanceKm).toFixed(2));
    const shouldSuppressStartNoise = adjustedElapsedSeconds <= startNoiseGraceSeconds
      && adjustedDistanceKm <= startNoiseGraceKm;
    const displayRoute = shouldSuppressStartNoise ? adjustedRoute.slice(0, 1) : adjustedRoute;

    return {
      route: displayRoute,
      distanceKm: shouldSuppressStartNoise ? 0 : adjustedDistanceKm,
      elevationGainM: shouldSuppressStartNoise ? 0 : calculateElevationGainM(displayRoute),
      currentPace: snapshot.currentPace,
      elapsedSeconds: adjustedElapsedSeconds,
      startedAt: officialStartBaseline.startedAt,
    };
  }

  if (hasPreStartWarmup) {
    return {
      route: [],
      distanceKm: 0,
      elevationGainM: 0,
      currentPace: snapshot.currentPace,
      elapsedSeconds: 0,
      startedAt: snapshot.startedAt,
    };
  }

  return {
    route: snapshot.route,
    distanceKm: snapshot.distanceKm,
    elevationGainM: snapshot.elevationGainM,
    currentPace: snapshot.currentPace,
    elapsedSeconds: rawElapsedSeconds,
    startedAt: snapshot.startedAt,
  };
}
