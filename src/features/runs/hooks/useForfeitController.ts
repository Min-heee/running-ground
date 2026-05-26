import { useMemo } from 'react';
import type { ComponentProps } from 'react';
import { LiveMatchExitActionCard } from '@/features/runs/components/LiveMatchExitActionCard';
import { buildMatchExitActionState } from '@/features/runs/lifecycle/matchExitAction';
import type { MatchExitSource } from '@/features/runs/lifecycle/matchExitFlow';

type UseForfeitControllerInput = {
  source: MatchExitSource | null;
  isTestMatch: boolean;
  isLeaving: boolean;
  isSaving: boolean;
  isRunning: boolean;
  counterpartForfeited: boolean;
  selfFinished: boolean;
  onContinueSolo: (source: MatchExitSource) => void;
  onForfeit: (source: MatchExitSource) => void;
  onShowResultAfterCounterpartForfeit: (source: MatchExitSource) => Promise<void> | void;
};

export function useForfeitController({
  source,
  isTestMatch,
  isLeaving,
  isSaving,
  isRunning,
  counterpartForfeited,
  selfFinished,
  onContinueSolo,
  onForfeit,
  onShowResultAfterCounterpartForfeit,
}: UseForfeitControllerInput) {
  const actionState = useMemo(() => buildMatchExitActionState({
    source,
    isTestMatch,
    isLeaving,
    isSaving,
    isRunning,
    counterpartForfeited,
    selfFinished,
  }), [
    counterpartForfeited,
    isLeaving,
    isRunning,
    isSaving,
    isTestMatch,
    selfFinished,
    source,
  ]);

  return useMemo<ComponentProps<typeof LiveMatchExitActionCard>>(() => ({
    source,
    actionState,
    onContinueSolo,
    onForfeit,
    onShowResultAfterCounterpartForfeit: (nextSource) => {
      void onShowResultAfterCounterpartForfeit(nextSource);
    },
  }), [
    actionState,
    onContinueSolo,
    onForfeit,
    onShowResultAfterCounterpartForfeit,
    source,
  ]);
}
