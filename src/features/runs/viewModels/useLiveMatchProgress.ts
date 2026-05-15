import { useEffect, useMemo, useRef } from 'react';
import {
  type DuelMatchOpponent,
  type GroupMatchParticipant,
  type RunningMatchRoom,
  type RunningMatchStatusResponse,
} from '@/lib/api/types';
import {
  buildDuelComparisonSnapshot,
  buildGroupLiveStandings,
  buildMatchProgressModel,
  hasRemoteRunnerProgress,
  type LastSyncedMatchProgress,
} from '@/features/runs/viewModels/matchProgress';
import {
  buildDuelLiveTitle,
  buildDuelStatusAlert,
  buildGroupProgressSnapshot,
} from '@/features/runs/viewModels/liveMatchProgressSelectors';
import { type RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type UseLiveMatchProgressInput = {
  matchMode: RunMatchMode;
  duelMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatus: RunningMatchStatusResponse | null;
  visibleMatchRoom: RunningMatchRoom | null;
  effectiveDuelOpponent: DuelMatchOpponent | null;
  effectiveGroupParticipants: GroupMatchParticipant[];
  effectiveGroupSeedRank?: number;
  lastSyncedMatchProgress: LastSyncedMatchProgress | null;
  distanceKm: number;
  elapsedSeconds: number;
  duelDistanceKm: number;
  groupDistanceKm: number;
  deferRankingCalculations?: boolean;
};

export function useLiveMatchProgress({
  matchMode,
  duelMatchStatus,
  groupMatchStatus,
  visibleMatchRoom,
  effectiveDuelOpponent,
  effectiveGroupParticipants,
  effectiveGroupSeedRank,
  lastSyncedMatchProgress,
  distanceKm,
  elapsedSeconds,
  duelDistanceKm,
  groupDistanceKm,
  deferRankingCalculations = false,
}: UseLiveMatchProgressInput) {
  const firstRemoteProgressReceivedRef = useRef(false);
  const groupLiveStandings = useMemo(
    () => (
      deferRankingCalculations && matchMode === 'group'
        ? []
        : buildGroupLiveStandings(effectiveGroupParticipants, effectiveGroupSeedRank, distanceKm, elapsedSeconds, groupDistanceKm)
    ),
    [deferRankingCalculations, distanceKm, elapsedSeconds, effectiveGroupParticipants, effectiveGroupSeedRank, groupDistanceKm, matchMode],
  );
  const groupProgressSnapshot = useMemo(
    () => buildGroupProgressSnapshot(groupLiveStandings),
    [groupLiveStandings],
  );
  const {
    currentGroupStanding,
    currentGroupLeader,
    groupAheadParticipant,
    groupBehindParticipant,
    featuredGroupArenaParticipantIds,
    groupStatusAlert,
  } = groupProgressSnapshot;
  const currentUserDuelLiveStatus = duelMatchStatus?.currentUserLiveStatus ?? null;
  const currentUserGroupLiveStatus = groupMatchStatus?.currentUserLiveStatus ?? currentGroupStanding?.liveStatus ?? null;
  const currentUserHasForfeitedActiveMatch = (
    matchMode === 'duel'
      ? currentUserDuelLiveStatus === 'forfeited'
      : matchMode === 'group'
        ? currentUserGroupLiveStatus === 'forfeited'
        : false
  );
  const activeDuelArenaMatchId = matchMode === 'duel'
    ? duelMatchStatus?.matchId
      ?? (visibleMatchRoom?.mode === 'duel' ? visibleMatchRoom.linkedMatchId ?? null : null)
    : null;
  const syncedDuelProgress = activeDuelArenaMatchId && lastSyncedMatchProgress?.matchId === activeDuelArenaMatchId
    ? lastSyncedMatchProgress
    : null;
  const fallbackDuelComparisonSnapshot = useMemo(
    () => buildDuelComparisonSnapshot(syncedDuelProgress, effectiveDuelOpponent, duelDistanceKm),
    [duelDistanceKm, effectiveDuelOpponent, syncedDuelProgress],
  );
  const officialDuelComparison = useMemo(
    () => duelMatchStatus?.officialComparison ?? null,
    [duelMatchStatus?.officialComparison],
  );
  const isDuelOpponentForfeited = effectiveDuelOpponent?.liveStatus === 'forfeited';
  const duelOpponentProgressModel = useMemo(
    () => buildMatchProgressModel(effectiveDuelOpponent, duelDistanceKm),
    [duelDistanceKm, effectiveDuelOpponent],
  );
  const officialDuelReady = Boolean(
    officialDuelComparison
    && officialDuelComparison.readyParticipantCount >= 2
    && typeof officialDuelComparison.userDistanceKm === 'number'
    && duelOpponentProgressModel.officialProgress?.ready,
  );
  const duelComparisonSnapshot = useMemo(() => (
    officialDuelReady
      ? {
          checkpointSeconds: officialDuelComparison?.elapsedSeconds ?? 0,
          currentDistanceKm: officialDuelComparison?.userDistanceKm ?? 0,
          opponentDistanceKm: duelOpponentProgressModel.officialProgress?.distanceKm ?? 0,
          gapKm: Number(((officialDuelComparison?.userDistanceKm ?? 0) - (duelOpponentProgressModel.officialProgress?.distanceKm ?? 0)).toFixed(2)),
        }
      : fallbackDuelComparisonSnapshot
  ), [
    duelOpponentProgressModel.officialProgress?.distanceKm,
    fallbackDuelComparisonSnapshot,
    officialDuelComparison?.elapsedSeconds,
    officialDuelComparison?.userDistanceKm,
    officialDuelReady,
  ]);
  const hasDuelOpponentDisplayProgress = Boolean(
    duelComparisonSnapshot || duelOpponentProgressModel.displayProgress.hasProgress || hasRemoteRunnerProgress(effectiveDuelOpponent),
  );
  const hasAnyRemoteDisplayProgress = useMemo(() => (
    matchMode === 'duel'
      ? hasDuelOpponentDisplayProgress
      : effectiveGroupParticipants.some((participant) => hasRemoteRunnerProgress(participant))
  ), [effectiveGroupParticipants, hasDuelOpponentDisplayProgress, matchMode]);

  useEffect(() => {
    if (firstRemoteProgressReceivedRef.current || !hasAnyRemoteDisplayProgress) {
      return;
    }

    firstRemoteProgressReceivedRef.current = true;
    rgPerfMark('first live progress received', {
      matchMode,
      source: 'remote display progress',
    });
  }, [hasAnyRemoteDisplayProgress, matchMode]);

  const syncedDuelDistanceKm = duelComparisonSnapshot?.currentDistanceKm ?? distanceKm;
  const syncedDuelOpponentDistanceKm = duelComparisonSnapshot?.opponentDistanceKm ?? duelOpponentProgressModel.displayProgress.distanceKm;
  const duelLiveGapKm = duelComparisonSnapshot?.gapKm ?? (
    hasDuelOpponentDisplayProgress
      ? Number((syncedDuelDistanceKm - syncedDuelOpponentDistanceKm).toFixed(2))
      : null
  );
  const duelLiveTitle = useMemo(
    () => buildDuelLiveTitle({ isDuelOpponentForfeited, duelLiveGapKm }),
    [duelLiveGapKm, isDuelOpponentForfeited],
  );
  const duelStatusAlert = useMemo(
    () => buildDuelStatusAlert(effectiveDuelOpponent),
    [effectiveDuelOpponent],
  );

  return {
    groupLiveStandings,
    currentGroupStanding,
    currentUserDuelLiveStatus,
    currentUserGroupLiveStatus,
    currentUserHasForfeitedActiveMatch,
    currentGroupLeader,
    groupAheadParticipant,
    groupBehindParticipant,
    featuredGroupArenaParticipantIds,
    isDuelOpponentForfeited,
    officialDuelReady,
    duelComparisonSnapshot,
    syncedDuelDistanceKm,
    syncedDuelOpponentDistanceKm,
    duelLiveGapKm,
    duelLiveTitle,
    duelStatusAlert,
    groupStatusAlert,
  };
}
