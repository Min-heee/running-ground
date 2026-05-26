import type { MatchLifecycleController } from '@/features/runs/lifecycle/matchLifecycleController';

export function shouldRunSlotElapsedTicker({
  activeMatchSlotStartAt,
  enabled = true,
}: {
  activeMatchSlotStartAt: string | null;
  enabled?: boolean;
}) {
  return enabled && Boolean(activeMatchSlotStartAt);
}

export function resolveSlotElapsedTickerDelayMs({
  slotStartMs,
  syncedNowMs,
}: {
  slotStartMs: number;
  syncedNowMs: number;
}) {
  const slotElapsedMs = syncedNowMs - slotStartMs;
  const elapsedMsIntoSecond = ((slotElapsedMs % 1000) + 1000) % 1000;
  const msUntilNextSecond = 1000 - elapsedMsIntoSecond;
  return Math.max(50, Math.min(1000, msUntilNextSecond));
}

export function resolveActiveMatchSlotStartAt(
  matchLifecycleController?: MatchLifecycleController,
) {
  if (!matchLifecycleController || matchLifecycleController.stage !== 'active') {
    return null;
  }

  return matchLifecycleController.gps.activeMatch?.slotStartAt ?? null;
}
