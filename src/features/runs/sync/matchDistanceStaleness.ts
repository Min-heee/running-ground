// Shared, pure staleness gate for MY live-match distance.
//
// Why this exists: distance is 100% JS-computed (background/locationTask.ts
// appendTrackedLocation). With the iPhone screen OFF mid-match, iOS suspends the JS thread,
// so GPS fixes still arrive but are never turned into distance — MY distance FREEZES while the
// wall-clock slot timer keeps counting elapsed. That makes the CUMULATIVE average pace
// (elapsedSeconds / distanceKm, buildAveragePace) balloon (e.g. "평균 13:02/km") and produces a
// phantom duel gap (my frozen synced checkpoint vs. the opponent's still-advancing server poll).
//
// This module does NOT fix the freeze (that needs a native distance accumulator). It only
// decides, by a FRESHNESS TIMESTAMP, whether MY distance is currently trustworthy enough to
// derive a number from. Detection is by timestamp age, NEVER by pace magnitude — a genuinely
// slow / walking runner whose GPS is still flowing must keep showing their real pace.

import { LIVE_MATCH_SERVER_SYNC_INTERVAL_MS } from '@/features/runs/sync/liveMatchCadence';

// Floor the staleness window so normal sync cadence + brief GPS gaps never trip it. The live
// sync/heartbeat cadence is LIVE_MATCH_SERVER_SYNC_INTERVAL_MS (2500ms); we allow ~4 missed
// cadences before calling MY distance stale, with a 12s floor. 4 * 2500 = 10000 < 12000, so the
// floor wins here, but the multiplier keeps the window proportional if the cadence ever changes.
export const MY_MATCH_DISTANCE_STALE_CADENCE_MULTIPLIER = 4;
export const MY_MATCH_DISTANCE_STALE_FLOOR_MS = 12_000;

export const MY_MATCH_DISTANCE_STALE_THRESHOLD_MS = Math.max(
  MY_MATCH_DISTANCE_STALE_FLOOR_MS,
  LIVE_MATCH_SERVER_SYNC_INTERVAL_MS * MY_MATCH_DISTANCE_STALE_CADENCE_MULTIPLIER,
);

export type MyMatchDistanceStalenessInput = {
  // Epoch ms of the freshest MY-distance signal: the most recent local distance/location update
  // or the synced match-progress checkpoint's updatedAt. null/undefined when no fresh signal has
  // ever been recorded yet (e.g. pre-first-sync) — treated as NOT stale so the early-run case
  // shows the normal "측정 대기 / 계산 중" path rather than a staleness suppression.
  lastUpdatedAtMs?: number | null;
  nowMs: number;
  // Defaults to MY_MATCH_DISTANCE_STALE_THRESHOLD_MS; override only in tests.
  thresholdMs?: number;
};

// True when MY live distance has not had a fresh update within thresholdMs — i.e. the JS thread
// is suspended (screen off) and distance is frozen while elapsed keeps climbing. Boundary: an age
// EXACTLY equal to the threshold is NOT yet stale (stale strictly past it), so the gate is
// generous toward the normal/slow-but-fresh case.
export function isMyMatchDistanceStale({
  lastUpdatedAtMs,
  nowMs,
  thresholdMs = MY_MATCH_DISTANCE_STALE_THRESHOLD_MS,
}: MyMatchDistanceStalenessInput): boolean {
  if (typeof lastUpdatedAtMs !== 'number' || !Number.isFinite(lastUpdatedAtMs)) {
    // No fresh signal recorded yet — do not suppress; let the normal not-ready path render.
    return false;
  }

  const ageMs = nowMs - lastUpdatedAtMs;

  if (!Number.isFinite(ageMs) || ageMs < 0) {
    // Future / clock-skew timestamp — treat as fresh rather than invent staleness.
    return false;
  }

  return ageMs > thresholdMs;
}
