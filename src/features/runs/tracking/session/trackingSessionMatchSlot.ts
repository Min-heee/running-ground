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

export function resolveActiveMatchSlotStartAt(
  matchLifecycleController?: MatchLifecycleController,
) {
  if (!matchLifecycleController || matchLifecycleController.stage !== 'active') {
    return null;
  }

  return matchLifecycleController.gps.activeMatch?.slotStartAt ?? null;
}
