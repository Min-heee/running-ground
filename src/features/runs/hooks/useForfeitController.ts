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
  selfForfeited: boolean;
  selfFinished: boolean;
  allOthersForfeited?: boolean;
  isPartyRun?: boolean;
  onContinueSolo: (source: MatchExitSource) => void;
  onForfeit: (source: MatchExitSource) => void;
  onShowResultAfterCounterpartForfeit: (source: MatchExitSource) => Promise<void> | void;
  onShowResultAfterSelfForfeit: (source: MatchExitSource) => Promise<void> | void;
};

export function useForfeitController({
  source,
  isTestMatch,
  isLeaving,
  isSaving,
  isRunning,
  counterpartForfeited,
  selfForfeited,
  selfFinished,
  allOthersForfeited = false,
  isPartyRun = false,
  onContinueSolo,
  onForfeit,
  onShowResultAfterCounterpartForfeit,
  onShowResultAfterSelfForfeit,
}: UseForfeitControllerInput) {
  const actionState = useMemo(() => buildMatchExitActionState({
    source,
    isTestMatch,
    isLeaving,
    isSaving,
    isRunning,
    counterpartForfeited,
    selfForfeited,
    selfFinished,
    allOthersForfeited,
    isPartyRun,
  }), [
    allOthersForfeited,
    isPartyRun,
    counterpartForfeited,
    isLeaving,
    isRunning,
    isSaving,
    isTestMatch,
    selfForfeited,
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
    onShowResultAfterSelfForfeit: (nextSource) => {
      void onShowResultAfterSelfForfeit(nextSource);
    },
  }), [
    actionState,
    onContinueSolo,
    onForfeit,
    onShowResultAfterCounterpartForfeit,
    onShowResultAfterSelfForfeit,
    source,
  ]);
}
