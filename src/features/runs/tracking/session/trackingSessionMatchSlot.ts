import type { MatchLifecycleController } from '@/features/runs/lifecycle/matchLifecycleController';

export function resolveActiveMatchSlotStartAt(
  matchLifecycleController?: MatchLifecycleController,
) {
  if (!matchLifecycleController || matchLifecycleController.stage !== 'active') {
    return null;
  }

  return matchLifecycleController.gps.activeMatch?.slotStartAt ?? null;
}
