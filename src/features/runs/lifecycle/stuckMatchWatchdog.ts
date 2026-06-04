export const STUCK_MATCH_NO_PROGRESS_MS = 30 * 60 * 1000;
export const STUCK_MATCH_MIN_PROGRESS_KM = 0.05;
export const STUCK_MATCH_WATCHDOG_CHECK_MS = 60 * 1000;

export function shouldAutoEndStuckMatch({
  isRealMatchActive,
  nowMs,
  lastProgressAtMs,
}: {
  isRealMatchActive: boolean;
  nowMs: number;
  lastProgressAtMs: number | null;
}) {
  if (!isRealMatchActive || lastProgressAtMs === null || !Number.isFinite(nowMs)) {
    return false;
  }

  return nowMs - lastProgressAtMs >= STUCK_MATCH_NO_PROGRESS_MS;
}
