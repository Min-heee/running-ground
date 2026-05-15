import { useEffect, useMemo, useRef } from 'react';
import {
  type DuelMatchOpponent,
  type GroupMatchParticipant,
  type RunningMatchRoom,
  type RunningMatchStatusResponse,
} from '@/lib/api/types';
import {
  buildGroupLiveStandings,
  type LastSyncedMatchProgress,
} from '@/features/runs/viewModels/matchProgress';
import {
  buildDuelLiveTitle,
  buildDuelStatusAlert,
  buildGroupProgressSnapshot,
} from '@/features/runs/viewModels/liveMatchProgressSelectors';
import {
  buildCurrentUserLiveStatusModel,
  buildDuelProgressDisplayModel,
  hasAnyLiveMatchRemoteDisplayProgress,
  resolveActiveDuelArenaMatchId,
  selectSyncedDuelProgress,
} from '@/features/runs/viewModels/liveMatchProgressModel';
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
  const {
    currentUserDuelLiveStatus,
    currentUserGroupLiveStatus,
    currentUserHasForfeitedActiveMatch,
  } = useMemo(() => buildCurrentUserLiveStatusModel({
    matchMode,
    duelMatchStatus,
    groupMatchStatus,
    currentGroupLiveStatus: currentGroupStanding?.liveStatus ?? null,
  }), [currentGroupStanding?.liveStatus, duelMatchStatus, groupMatchStatus, matchMode]);
  const activeDuelArenaMatchId = useMemo(() => resolveActiveDuelArenaMatchId({
    matchMode,
    duelMatchStatus,
    visibleMatchRoom,
  }), [duelMatchStatus, matchMode, visibleMatchRoom]);
  const syncedDuelProgress = useMemo(() => selectSyncedDuelProgress({
    activeDuelArenaMatchId,
    lastSyncedMatchProgress,
  }), [activeDuelArenaMatchId, lastSyncedMatchProgress]);
  const {
    isDuelOpponentForfeited,
    officialDuelReady,
    duelComparisonSnapshot,
    hasDuelOpponentDisplayProgress,
    syncedDuelDistanceKm,
    syncedDuelOpponentDistanceKm,
    duelLiveGapKm,
  } = useMemo(() => buildDuelProgressDisplayModel({
    duelMatchStatus,
    syncedDuelProgress,
    effectiveDuelOpponent,
    duelDistanceKm,
    distanceKm,
  }), [
    distanceKm,
    duelDistanceKm,
    duelMatchStatus,
    effectiveDuelOpponent,
    syncedDuelProgress,
  ]);
  const hasAnyRemoteDisplayProgress = useMemo(() => (
    hasAnyLiveMatchRemoteDisplayProgress({
      matchMode,
      hasDuelOpponentDisplayProgress,
      effectiveGroupParticipants,
    })
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
