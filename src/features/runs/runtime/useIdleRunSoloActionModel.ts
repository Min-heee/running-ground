import { useMemo } from 'react';
import type {
  RunningReadyScreenProps,
  UseIdleRunRuntimeModelInput,
} from '@/features/runs/runtime/idleRunRuntimeTypes';

type MatchSetupProps = RunningReadyScreenProps['matchSetupProps'];

type UseIdleRunSoloActionModelInput = Pick<
  UseIdleRunRuntimeModelInput,
  | 'bottomInset'
  | 'cancelingUpcomingMatchId'
  | 'matchMode'
  | 'onCancelUpcomingMatch'
  | 'onOpenUpcomingMatch'
  | 'onReadyAction'
  | 'readyActionLabel'
  | 'visibleUpcomingMatches'
  | 'visibleUpcomingMatchesNowMs'
> & {
  matchSetupProps: MatchSetupProps;
  readyActionDisabled: boolean;
  readyActionLoadingLabel?: string;
};

export function useIdleRunSoloActionModel({
  bottomInset,
  cancelingUpcomingMatchId,
  matchMode,
  matchSetupProps,
  onCancelUpcomingMatch,
  onOpenUpcomingMatch,
  onReadyAction,
  readyActionDisabled,
  readyActionLabel,
  readyActionLoadingLabel,
  visibleUpcomingMatches,
  visibleUpcomingMatchesNowMs,
}: UseIdleRunSoloActionModelInput) {
  const readyUpcomingMatchesProps = useMemo(() => ({
    matches: visibleUpcomingMatches,
    nowMs: visibleUpcomingMatchesNowMs,
    cancelingMatchId: cancelingUpcomingMatchId,
    onOpenMatch: onOpenUpcomingMatch,
    onCancelMatch: onCancelUpcomingMatch,
  }), [
    cancelingUpcomingMatchId,
    onCancelUpcomingMatch,
    onOpenUpcomingMatch,
    visibleUpcomingMatches,
    visibleUpcomingMatchesNowMs,
  ]);

  return useMemo<RunningReadyScreenProps>(() => ({
    bottomInset,
    upcomingMatchesProps: readyUpcomingMatchesProps,
    matchSetupProps,
    readyActionLabel,
    readyActionLoadingLabel,
    readyActionDisabled,
    onReadyAction,
    // 페이스메이커 is a solo-only flow — hide the entry in duel/group/party.
    showSoloCoachEntry: matchMode === 'solo',
  }), [
    bottomInset,
    matchMode,
    matchSetupProps,
    onReadyAction,
    readyActionDisabled,
    readyActionLabel,
    readyActionLoadingLabel,
    readyUpcomingMatchesProps,
  ]);
}
