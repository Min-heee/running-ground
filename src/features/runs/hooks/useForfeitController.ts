import { useMemo } from 'react';
import type { ComponentProps } from 'react';
import { LiveMatchExitActionCard } from '@/features/runs/components/LiveMatchExitActionCard';
import type { MatchExitSource } from '@/features/runs/matchExitFlow';

type UseForfeitControllerInput = Omit<
  ComponentProps<typeof LiveMatchExitActionCard>,
  'onShowResultAfterCounterpartForfeit'
> & {
  onShowResultAfterCounterpartForfeit: (source: MatchExitSource) => Promise<void> | void;
};

export function useForfeitController({
  source,
  isTestMatch,
  isLeaving,
  isSaving,
  isRunning,
  counterpartForfeited,
  onContinueSolo,
  onForfeit,
  onShowResultAfterCounterpartForfeit,
}: UseForfeitControllerInput) {
  return useMemo<ComponentProps<typeof LiveMatchExitActionCard>>(() => ({
    source,
    isTestMatch,
    isLeaving,
    isSaving,
    isRunning,
    counterpartForfeited,
    onContinueSolo,
    onForfeit,
    onShowResultAfterCounterpartForfeit: (nextSource) => {
      void onShowResultAfterCounterpartForfeit(nextSource);
    },
  }), [
    counterpartForfeited,
    isLeaving,
    isRunning,
    isSaving,
    isTestMatch,
    onContinueSolo,
    onForfeit,
    onShowResultAfterCounterpartForfeit,
    source,
  ]);
}
