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
  }), [
    bottomInset,
    matchSetupProps,
    onReadyAction,
    readyActionDisabled,
    readyActionLabel,
    readyActionLoadingLabel,
    readyUpcomingMatchesProps,
  ]);
}
