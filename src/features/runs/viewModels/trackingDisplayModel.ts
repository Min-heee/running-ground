import type { RunRoutePoint } from '@/domain';
import type { BackgroundRunTrackingSnapshot } from '@/features/runs/tracking/background';
import {
  buildRouteFromOfficialStart,
  type OfficialStartBaseline,
} from '@/features/runs/tracking/trackingSession';
import { calculateElevationGainM } from '@/features/runs/tracking';

export type DisplayedTrackingSnapshot = {
  route: RunRoutePoint[];
  distanceKm: number;
  elevationGainM: number;
  currentPace: string;
  elapsedSeconds: number;
  startedAt: string | null;
};

function resolveSlotAnchoredElapsedSeconds({
  matchSlotStartAt,
  snapshot,
  syncedNowMs,
}: {
  matchSlotStartAt?: string | null;
  snapshot: BackgroundRunTrackingSnapshot;
  syncedNowMs?: number | null;
}) {
  if (
    !matchSlotStartAt
    || typeof syncedNowMs !== 'number'
    || !Number.isFinite(syncedNowMs)
  ) {
    return null;
  }

  const slotStartMs = Date.parse(matchSlotStartAt);
  if (!Number.isFinite(slotStartMs)) {
    return null;
  }

  const elapsedMs = syncedNowMs - slotStartMs - snapshot.accumulatedPausedMs;
  return Math.max(0, Math.floor(elapsedMs / 1000));
}

export function buildDisplayedTrackingSnapshot({
  snapshot,
  rawElapsedSeconds,
  officialStartBaseline,
  hasPreStartWarmup,
  matchSlotStartAt,
  startNoiseGraceSeconds,
  startNoiseGraceKm,
  syncedNowMs,
}: {
  snapshot: BackgroundRunTrackingSnapshot;
  rawElapsedSeconds: number;
  officialStartBaseline: OfficialStartBaseline | null;
  hasPreStartWarmup: boolean;
  matchSlotStartAt?: string | null;
  startNoiseGraceSeconds: number;
  startNoiseGraceKm: number;
  syncedNowMs?: number | null;
}): DisplayedTrackingSnapshot {
  const slotAnchoredElapsedSeconds = resolveSlotAnchoredElapsedSeconds({
    matchSlotStartAt,
    snapshot,
    syncedNowMs,
  });
  const slotAnchoredStartedAt = slotAnchoredElapsedSeconds === null ? null : matchSlotStartAt ?? null;

  if (officialStartBaseline) {
    const adjustedRoute = buildRouteFromOfficialStart(snapshot, officialStartBaseline);
    const adjustedElapsedSeconds = slotAnchoredElapsedSeconds
      ?? Math.max(0, rawElapsedSeconds - officialStartBaseline.elapsedSeconds);
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
      startedAt: slotAnchoredStartedAt ?? officialStartBaseline.startedAt,
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
    elapsedSeconds: slotAnchoredElapsedSeconds ?? rawElapsedSeconds,
    startedAt: slotAnchoredStartedAt ?? snapshot.startedAt,
  };
}
