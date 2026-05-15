import type { UseTrackRunRuntimeEffectsInput } from '@/features/runs/types/runtimeEffects';
import { useRuntimeCleanupEffects } from '@/features/runs/runtime/useRuntimeCleanupEffects';
import { useRuntimeHydrationEffects } from '@/features/runs/runtime/useRuntimeHydrationEffects';
import { useRuntimeNavigationEffects } from '@/features/runs/runtime/useRuntimeNavigationEffects';
import { useRuntimeTimerEffects } from '@/features/runs/runtime/useRuntimeTimerEffects';

export function useTrackRunRuntimeEffects({
  blockingMatchStatusPolling,
  countdownTicker,
  demandSummaryEffects,
  directStatusEffects,
  initialLoadEffects,
  liveMatchNavigationEffects,
  matchEntryEffects,
  notificationSync,
  partyRunSync,
  staleMatchCleanup,
  upcomingMatchPolling,
}: UseTrackRunRuntimeEffectsInput) {
  useRuntimeHydrationEffects({
    demandSummaryEffects,
    directStatusEffects,
    initialLoadEffects,
  });
  useRuntimeTimerEffects({
    blockingMatchStatusPolling,
    countdownTicker,
    upcomingMatchPolling,
  });
  useRuntimeCleanupEffects({
    staleMatchCleanup,
  });
  useRuntimeNavigationEffects({
    liveMatchNavigationEffects,
    matchEntryEffects,
    notificationSync,
    partyRunSync,
  });
}
