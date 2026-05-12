import { useMemo } from 'react';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  type GroupLiveStanding,
} from '@/features/runs/matchProgress';
import {
  buildDuelMatchFinishModel,
  buildGroupMatchFinishModel,
} from '@/features/runs/matchResultModel';
import { getEstimatedMatchBonusPoints } from '@/features/runs/matchScheduling';
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
  const duelFinishSummary = useMemo(
    () => buildDuelMatchFinishModel({
      opponent: effectiveDuelOpponent,
      currentDistanceKm: distanceKm,
      targetDistanceKm: duelDistanceKm,
      currentElapsedSeconds: elapsedSeconds,
      currentPaceLabel: currentUserArenaPace,
      currentUserLiveStatus: currentUserDuelLiveStatus,
    }),
    [currentUserArenaPace, currentUserDuelLiveStatus, distanceKm, duelDistanceKm, effectiveDuelOpponent, elapsedSeconds],
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
