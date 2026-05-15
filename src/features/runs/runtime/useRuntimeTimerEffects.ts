import { useSyncedCountdownTicker } from '@/features/runs/lifecycle/hooks/useSyncedCountdownTicker';
import { useBlockingMatchStatusPolling } from '@/features/runs/sync/matchPolling/useBlockingMatchStatusPolling';
import { useUpcomingMatchPolling } from '@/features/runs/sync/matchPolling/useUpcomingMatchPolling';
import type { RuntimeTimerEffectsInput } from '@/features/runs/types/runtimeEffects';

export function useRuntimeTimerEffects({
  blockingMatchStatusPolling,
  countdownTicker,
  upcomingMatchPolling,
}: RuntimeTimerEffectsInput) {
  useUpcomingMatchPolling(upcomingMatchPolling);
  useSyncedCountdownTicker(countdownTicker);
  useBlockingMatchStatusPolling(blockingMatchStatusPolling);
}
