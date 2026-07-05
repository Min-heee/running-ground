// HANDS-FREE FINISH (Stage 3d) — pure save-time clamp against the local goal freeze.
//
// The displayed snapshot a save reads keeps DRIFTING after the goal crossing: the slot-anchored
// display model keeps ticking elapsed (trackingDisplayModel), and GPS keeps appending distance /
// route points until tracking actually stops. When a freeze exists for the exact match being
// saved, the at-crossing values are the truth the server already froze — so the local record is
// clamped DOWN to them and the route is cut at the crossing time.
//
// ANTI-CORRUPTION INVARIANT: every clamp is Math.min / strictly downward — a freeze can NEVER
// inflate a value. A forfeit save (values below the freeze) passes through unchanged; a missing/
// invalid freeze is a no-op passthrough. The caller scopes the freeze to the exact activeMatchId.

import type { RunRoutePoint } from '@/domain';
import type { LocalGoalFreeze } from '@/features/runs/sync/localGoalFreezeStore';
import type { DisplayedTrackingSnapshot } from './types';

// Drop route points recorded AFTER the crossing so the saved map has no post-goal tail and the
// mapper's endedAt (last route timestamp) lands at the crossing area. If fewer than 2 points
// would remain (crossing computed before GPS produced a usable line), keep the untruncated route:
// the route is display-only — the backend never derives distance from it (runSaveResultMapper).
function truncateRouteAtCrossing(route: RunRoutePoint[], crossedAtIso: string): RunRoutePoint[] {
  const crossedAtMs = new Date(crossedAtIso).getTime();
  if (!Number.isFinite(crossedAtMs)) {
    return route;
  }

  const truncated = route.filter((point) => {
    const pointMs = new Date(point.timestamp).getTime();
    // Keep unparseable timestamps (never destroy data on a malformed point).
    return !Number.isFinite(pointMs) || pointMs <= crossedAtMs;
  });

  if (truncated.length < 2) {
    return route;
  }
  return truncated;
}

// Apply the at-crossing freeze to the snapshot the save flow is about to persist. min-only:
//   - elapsedSeconds  = min(displayed, freeze) — kills the slot-anchored post-goal drift,
//   - distanceKm      = min(displayed, freeze) — the freeze is the measured-at-crossing distance,
//   - route           = truncated at freeze.crossedAtIso (kept whole when <2 points remain).
// Everything else (pace label, elevation, startedAt) passes through untouched.
export function applyGoalFreezeToDisplayedSnapshot(
  displayedSnapshot: DisplayedTrackingSnapshot,
  freeze: LocalGoalFreeze | null | undefined,
): DisplayedTrackingSnapshot {
  if (!freeze) {
    return displayedSnapshot;
  }

  const canClampElapsed = Number.isFinite(freeze.elapsedSeconds) && freeze.elapsedSeconds > 0;
  const canClampDistance = Number.isFinite(freeze.distanceKm) && freeze.distanceKm > 0;

  return {
    ...displayedSnapshot,
    elapsedSeconds: canClampElapsed
      ? Math.min(displayedSnapshot.elapsedSeconds, freeze.elapsedSeconds)
      : displayedSnapshot.elapsedSeconds,
    distanceKm: canClampDistance
      ? Math.min(displayedSnapshot.distanceKm, freeze.distanceKm)
      : displayedSnapshot.distanceKm,
    route: truncateRouteAtCrossing(displayedSnapshot.route, freeze.crossedAtIso),
  };
}
