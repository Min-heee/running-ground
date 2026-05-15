import { useStaleMatchCleanup } from '@/features/runs/sync/matchPolling/useStaleMatchCleanup';
import type { RuntimeCleanupEffectsInput } from '@/features/runs/types/runtimeEffects';

export function useRuntimeCleanupEffects({
  staleMatchCleanup,
}: RuntimeCleanupEffectsInput) {
  useStaleMatchCleanup(staleMatchCleanup);
}
