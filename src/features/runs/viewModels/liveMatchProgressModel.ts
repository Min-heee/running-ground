import { type RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  buildDuelComparisonSnapshot,
  buildMatchProgressModel,
  hasRemoteRunnerProgress,
  type DuelComparisonSnapshot,
  type LastSyncedMatchProgress,
} from '@/features/runs/viewModels/matchProgress';
import type {
  DuelMatchOpponent,
  GroupMatchParticipant,
  RunningMatchRoom,
  RunningMatchStatusResponse,
} from '@/lib/api/types';
import type { ForfeitedMatchSnapshot } from '@/features/runs/types/matchForfeit';

export type CurrentUserLiveStatusModel = {
  currentUserDuelLiveStatus: DuelMatchOpponent['liveStatus'] | null;
  currentUserGroupLiveStatus: DuelMatchOpponent['liveStatus'] | null;
  currentUserHasForfeitedActiveMatch: boolean;
};

export type DuelProgressDisplayModel = {
  isDuelOpponentForfeited: boolean;
  officialDuelReady: boolean;
  duelComparisonSnapshot: DuelComparisonSnapshot | null;
  hasDuelOpponentDisplayProgress: boolean;
  syncedDuelDistanceKm: number;
  syncedDuelOpponentDistanceKm: number;
  duelLiveGapKm: number | null;
};

type OfficialDuelComparison = NonNullable<RunningMatchStatusResponse['officialComparison']>;

export function buildCurrentUserLiveStatusModel({
  matchMode,
  duelMatchStatus,
  groupMatchStatus,
  currentGroupLiveStatus,
  locallyForfeitedMatches,
  activeMatchId,
}: {
  matchMode: RunMatchMode;
  duelMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatus: RunningMatchStatusResponse | null;
  currentGroupLiveStatus: DuelMatchOpponent['liveStatus'] | null;
  locallyForfeitedMatches: ReadonlyMap<string, ForfeitedMatchSnapshot>;
  activeMatchId: string | null;
}): CurrentUserLiveStatusModel {
  const currentUserDuelLiveStatus = duelMatchStatus?.currentUserLiveStatus ?? null;
  const resolvedCurrentUserGroupLiveStatus = groupMatchStatus?.currentUserLiveStatus ?? currentGroupLiveStatus ?? null;
  const isLocallyForfeited = activeMatchId !== null && locallyForfeitedMatches.has(activeMatchId);
  const currentUserHasForfeitedActiveMatch = (
    isLocallyForfeited
    || (
      matchMode === 'duel'
        ? currentUserDuelLiveStatus === 'forfeited'
        : matchMode === 'group'
          ? resolvedCurrentUserGroupLiveStatus === 'forfeited'
          : false
    )
  );

  return {
    currentUserDuelLiveStatus,
    currentUserGroupLiveStatus: resolvedCurrentUserGroupLiveStatus,
    currentUserHasForfeitedActiveMatch,
  };
}

export function resolveActiveDuelArenaMatchId({
  matchMode,
  duelMatchStatus,
  visibleMatchRoom,
}: {
  matchMode: RunMatchMode;
  duelMatchStatus: RunningMatchStatusResponse | null;
  visibleMatchRoom: RunningMatchRoom | null;
}) {
  if (matchMode !== 'duel') {
    return null;
  }

  return duelMatchStatus?.matchId
    ?? (visibleMatchRoom?.mode === 'duel' ? visibleMatchRoom.linkedMatchId ?? null : null);
}

export function selectSyncedDuelProgress({
  activeDuelArenaMatchId,
  lastSyncedMatchProgress,
}: {
  activeDuelArenaMatchId: string | null;
  lastSyncedMatchProgress: LastSyncedMatchProgress | null;
}) {
  return activeDuelArenaMatchId && lastSyncedMatchProgress?.matchId === activeDuelArenaMatchId
    ? lastSyncedMatchProgress
    : null;
}

function buildOfficialDuelComparisonSnapshot({
  officialDuelComparison,
  officialOpponentDistanceKm,
}: {
  officialDuelComparison: OfficialDuelComparison;
  officialOpponentDistanceKm: number;
}): DuelComparisonSnapshot {
  const currentDistanceKm = officialDuelComparison.userDistanceKm ?? 0;

  return {
    checkpointSeconds: officialDuelComparison.elapsedSeconds,
    currentDistanceKm,
    opponentDistanceKm: officialOpponentDistanceKm,
    gapKm: Number((currentDistanceKm - officialOpponentDistanceKm).toFixed(2)),
  };
}

export function buildDuelProgressDisplayModel({
  duelMatchStatus,
  syncedDuelProgress,
  effectiveDuelOpponent,
  duelDistanceKm,
  distanceKm,
}: {
  duelMatchStatus: RunningMatchStatusResponse | null;
  syncedDuelProgress: LastSyncedMatchProgress | null;
  effectiveDuelOpponent: DuelMatchOpponent | null;
  duelDistanceKm: number;
  distanceKm: number;
}): DuelProgressDisplayModel {
  const fallbackDuelComparisonSnapshot = buildDuelComparisonSnapshot(
    syncedDuelProgress,
    effectiveDuelOpponent,
    duelDistanceKm,
  );
  const officialDuelComparison = duelMatchStatus?.officialComparison ?? null;
  const isDuelOpponentForfeited = effectiveDuelOpponent?.liveStatus === 'forfeited';
  const duelOpponentProgressModel = buildMatchProgressModel(effectiveDuelOpponent, duelDistanceKm);
  const officialDuelReady = Boolean(
    officialDuelComparison
    && officialDuelComparison.readyParticipantCount >= 2
    && typeof officialDuelComparison.userDistanceKm === 'number'
    && duelOpponentProgressModel.officialProgress?.ready,
  );
  const duelComparisonSnapshot = officialDuelReady && officialDuelComparison
    ? buildOfficialDuelComparisonSnapshot({
        officialDuelComparison,
        officialOpponentDistanceKm: duelOpponentProgressModel.officialProgress?.distanceKm ?? 0,
      })
    : fallbackDuelComparisonSnapshot;
  const hasDuelOpponentDisplayProgress = Boolean(
    duelComparisonSnapshot
    || duelOpponentProgressModel.displayProgress.hasProgress
    || hasRemoteRunnerProgress(effectiveDuelOpponent),
  );
  const syncedDuelDistanceKm = duelComparisonSnapshot?.currentDistanceKm ?? distanceKm;
  const syncedDuelOpponentDistanceKm = duelComparisonSnapshot?.opponentDistanceKm ?? duelOpponentProgressModel.displayProgress.distanceKm;
  const duelLiveGapKm = duelComparisonSnapshot?.gapKm ?? (
    hasDuelOpponentDisplayProgress
      ? Number((syncedDuelDistanceKm - syncedDuelOpponentDistanceKm).toFixed(2))
      : null
  );

  return {
    isDuelOpponentForfeited,
    officialDuelReady,
    duelComparisonSnapshot,
    hasDuelOpponentDisplayProgress,
    syncedDuelDistanceKm,
    syncedDuelOpponentDistanceKm,
    duelLiveGapKm,
  };
}

export function hasAnyLiveMatchRemoteDisplayProgress({
  matchMode,
  hasDuelOpponentDisplayProgress,
  effectiveGroupParticipants,
}: {
  matchMode: RunMatchMode;
  hasDuelOpponentDisplayProgress: boolean;
  effectiveGroupParticipants: GroupMatchParticipant[];
}) {
  return matchMode === 'duel'
    ? hasDuelOpponentDisplayProgress
    : effectiveGroupParticipants.some((participant) => hasRemoteRunnerProgress(participant));
}
