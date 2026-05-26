import { useEffect, useMemo, useRef } from 'react';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  type GroupLiveStanding,
} from '@/features/runs/viewModels/matchProgress';
import {
  buildDuelMatchFinishModel,
  buildGroupMatchFinishModel,
} from '@/features/runs/viewModels/matchResultModel';
import { getEstimatedMatchBonusPoints } from '@/features/runs/utils/matchScheduling';
import type {
  DuelMatchOpponent,
  RunningMatchLiveStatus,
} from '@/lib/api/types';

type UseMatchResultControllerInput = {
  matchMode: RunMatchMode;
  effectiveDuelOpponent: DuelMatchOpponent | null;
  currentGroupStanding: GroupLiveStanding | null;
  effectiveGroupParticipantCount: number;
  groupLiveStandings: GroupLiveStanding[];
  currentUserArenaPace: string;
  currentUserDuelLiveStatus?: RunningMatchLiveStatus | null;
  distanceKm: number;
  duelDistanceKm: number;
  groupDistanceKm: number;
  elapsedSeconds: number;
};

type FrozenDuelResultMetrics = {
  distanceKm: number;
  elapsedSeconds: number;
  paceLabel: string;
};

export function useMatchResultController({
  matchMode,
  effectiveDuelOpponent,
  currentGroupStanding,
  effectiveGroupParticipantCount,
  groupLiveStandings,
  currentUserArenaPace,
  currentUserDuelLiveStatus,
  distanceKm,
  duelDistanceKm,
  groupDistanceKm,
  elapsedSeconds,
}: UseMatchResultControllerInput) {
  const duelFrozenRef = useRef<FrozenDuelResultMetrics | null>(null);
  const isCurrentUserDuelFinished = currentUserDuelLiveStatus === 'finished';

  useEffect(() => {
    if (matchMode !== 'duel' || !isCurrentUserDuelFinished) {
      duelFrozenRef.current = null;
      return;
    }

    if (duelFrozenRef.current) {
      return;
    }

    duelFrozenRef.current = {
      distanceKm,
      elapsedSeconds,
      paceLabel: currentUserArenaPace,
    };
  }, [
    currentUserArenaPace,
    distanceKm,
    elapsedSeconds,
    isCurrentUserDuelFinished,
    matchMode,
  ]);

  const duelFinishSummary = useMemo(
    () => {
      const frozen = duelFrozenRef.current;
      const effectiveDistanceKm = isCurrentUserDuelFinished && frozen
        ? frozen.distanceKm
        : distanceKm;
      const effectiveElapsedSeconds = isCurrentUserDuelFinished && frozen
        ? frozen.elapsedSeconds
        : elapsedSeconds;
      const effectivePaceLabel = isCurrentUserDuelFinished && frozen
        ? frozen.paceLabel
        : currentUserArenaPace;

      return buildDuelMatchFinishModel({
        opponent: effectiveDuelOpponent,
        currentDistanceKm: effectiveDistanceKm,
        targetDistanceKm: duelDistanceKm,
        currentElapsedSeconds: effectiveElapsedSeconds,
        currentPaceLabel: effectivePaceLabel,
        currentUserLiveStatus: currentUserDuelLiveStatus,
      });
    },
    [
      currentUserArenaPace,
      currentUserDuelLiveStatus,
      distanceKm,
      duelDistanceKm,
      effectiveDuelOpponent,
      elapsedSeconds,
      isCurrentUserDuelFinished,
    ],
  );

  const groupFinishSummary = useMemo(
    () => buildGroupMatchFinishModel({
      currentStanding: currentGroupStanding,
      participantCount: effectiveGroupParticipantCount,
      standings: groupLiveStandings,
      currentPaceLabel: currentUserArenaPace,
      currentElapsedSeconds: elapsedSeconds,
      targetDistanceKm: groupDistanceKm,
    }),
    [currentGroupStanding, currentUserArenaPace, effectiveGroupParticipantCount, elapsedSeconds, groupDistanceKm, groupLiveStandings],
  );

  const trackedMatchResult = matchMode === 'duel'
    ? duelFinishSummary?.matchResult
    : matchMode === 'group'
      ? groupFinishSummary?.matchResult
      : undefined;

  const estimatedMatchBonusPoints = useMemo(
    () => getEstimatedMatchBonusPoints(trackedMatchResult),
    [trackedMatchResult],
  );

  const duelResultRows = matchMode === 'duel' ? duelFinishSummary?.rows ?? [] : [];
  const groupResultRows = matchMode === 'group' ? groupFinishSummary?.rows ?? [] : [];
  const groupResultStatusLabel = matchMode === 'group' ? groupFinishSummary?.statusLabel ?? null : null;

  return {
    duelFinishSummary,
    groupFinishSummary,
    trackedMatchResult,
    estimatedMatchBonusPoints,
    duelResultRows,
    groupResultRows,
    groupResultStatusLabel,
  };
}
