import { useMemo, useRef } from 'react';
import type { MatchExitSource } from '@/features/runs/lifecycle/matchExitFlow';
import { useRunFinishCommand } from '@/features/runs/hooks/runSaveFlow/useRunFinishCommand';
import { useRunForfeitCommand } from '@/features/runs/hooks/runSaveFlow/useRunForfeitCommand';
import { useRunSaveCommand } from '@/features/runs/hooks/runSaveFlow/useRunSaveCommand';
import type {
  RunSaveFlowActions,
  UseRunSaveFlowInput,
} from '@/features/runs/hooks/runSaveFlow/types';

export function useRunSaveFlow(input: UseRunSaveFlowInput) {
  const isSaving = input.status === 'saving';
  const isPartyRun = Boolean(input.roomLinkedMatchContext);
  const setMatchLeaving = (source: MatchExitSource, isLeaving: boolean) => {
    if (source === 'duel') {
      input.setIsLeavingDuelMatch(isLeaving);
    } else {
      input.setIsLeavingGroupMatch(isLeaving);
    }
  };

  const {
    discardCurrentTracking,
    handleContinueSoloFromMatch,
    handleDiscardTracking,
    leaveMatchAndContinueSolo,
  } = useRunFinishCommand({
    ...input,
    setMatchLeaving,
  });
  const handleSaveTracking = useRunSaveCommand({
    ...input,
    discardCurrentTracking,
    isPartyRun,
  });
  const {
    forfeitMatchAndEndRun,
    handleForfeitMatch,
    handleShowResultAfterCounterpartForfeit,
    handleShowResultAfterSelfForfeit,
  } = useRunForfeitCommand({
    ...input,
    handleSaveTracking,
    isPartyRun,
    isSaving,
    setMatchLeaving,
  });

  const actions: RunSaveFlowActions = {
    discardCurrentTracking,
    handleDiscardTracking,
    handleSaveTracking,
    leaveMatchAndContinueSolo,
    handleContinueSoloFromMatch,
    forfeitMatchAndEndRun,
    handleForfeitMatch,
    handleShowResultAfterCounterpartForfeit,
    handleShowResultAfterSelfForfeit,
  };
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  return useMemo<RunSaveFlowActions>(() => ({
    discardCurrentTracking: () => actionsRef.current.discardCurrentTracking(),
    handleDiscardTracking: () => actionsRef.current.handleDiscardTracking(),
    handleSaveTracking: (options) => actionsRef.current.handleSaveTracking(options),
    leaveMatchAndContinueSolo: (source, options) => actionsRef.current.leaveMatchAndContinueSolo(source, options),
    handleContinueSoloFromMatch: (source) => actionsRef.current.handleContinueSoloFromMatch(source),
    forfeitMatchAndEndRun: (source) => actionsRef.current.forfeitMatchAndEndRun(source),
    handleForfeitMatch: (source) => actionsRef.current.handleForfeitMatch(source),
    handleShowResultAfterCounterpartForfeit: (source) => actionsRef.current.handleShowResultAfterCounterpartForfeit(source),
    handleShowResultAfterSelfForfeit: (source) => actionsRef.current.handleShowResultAfterSelfForfeit(source),
  }), []);
}
