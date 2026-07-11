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
import { isOfficialDuelCheckpointStale } from '@/features/runs/viewModels/officialCheckpointStaleness';

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

export type DuelOpponentForfeitLatch = {
  matchId: string | null;
  opponent: DuelMatchOpponent;
} | null;

type OfficialDuelComparison = NonNullable<RunningMatchStatusResponse['officialComparison']>;

export function resolveDuelOpponentForfeitLatch({
  activeMatchId,
  matchMode,
  opponent,
  previousLatch,
}: {
  activeMatchId: string | null;
  matchMode: RunMatchMode;
  opponent: DuelMatchOpponent | null;
  previousLatch: DuelOpponentForfeitLatch;
}): DuelOpponentForfeitLatch {
  if (matchMode !== 'duel') {
    return null;
  }

  if (previousLatch && previousLatch.matchId !== activeMatchId) {
    return null;
  }

  if (opponent?.liveStatus === 'forfeited') {
    return {
      matchId: activeMatchId,
      opponent,
    };
  }

  return previousLatch;
}

export function applyDuelOpponentForfeitLatch(
  opponent: DuelMatchOpponent | null,
  latch: DuelOpponentForfeitLatch,
): DuelMatchOpponent | null {
  if (!latch) {
    return opponent;
  }

  return {
    ...latch.opponent,
    ...(opponent ?? {}),
    liveStatus: 'forfeited',
    liveUpdatedAt: opponent?.liveUpdatedAt ?? latch.opponent.liveUpdatedAt,
  };
}

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

function shouldPreferSurvivorLiveDistance(
  duelMatchStatus: RunningMatchStatusResponse | null,
  effectiveDuelOpponent: DuelMatchOpponent | null,
) {
  return effectiveDuelOpponent?.liveStatus === 'finished'
    && (
      duelMatchStatus?.currentUserLiveStatus === 'running'
      || duelMatchStatus?.currentUserLiveStatus === 'background'
    );
}

export function buildDuelProgressDisplayModel({
  duelMatchStatus,
  syncedDuelProgress,
  effectiveDuelOpponent,
  duelDistanceKm,
  distanceKm,
  nowMs = Date.now(),
}: {
  duelMatchStatus: RunningMatchStatusResponse | null;
  syncedDuelProgress: LastSyncedMatchProgress | null;
  effectiveDuelOpponent: DuelMatchOpponent | null;
  duelDistanceKm: number;
  distanceKm: number;
  nowMs?: number;
}): DuelProgressDisplayModel {
  const fallbackDuelComparisonSnapshot = buildDuelComparisonSnapshot(
    syncedDuelProgress,
    effectiveDuelOpponent,
    duelDistanceKm,
  );
  const officialDuelComparison = duelMatchStatus?.officialComparison ?? null;
  const isDuelOpponentForfeited = effectiveDuelOpponent?.liveStatus === 'forfeited';
  const duelOpponentProgressModel = buildMatchProgressModel(effectiveDuelOpponent, duelDistanceKm);
  const officialDuelComparisonAvailable = Boolean(
    officialDuelComparison
    && officialDuelComparison.readyParticipantCount >= 2
    && typeof officialDuelComparison.userDistanceKm === 'number'
    && duelOpponentProgressModel.officialProgress?.ready,
  );
  // CHECKPOINT STALE-FALLBACK — the common checkpoint advances only when BOTH server rows
  // advance, so one dead push channel pins the whole head-to-head (the fairness design's one
  // fragility). When the checkpoint has not MOVED for the stall window, degrade to the raw
  // last-received comparison (the pre-official display path, footer drops '서버 공식') so the
  // screen keeps living through transport hiccups; the fair comparison resumes automatically
  // on the next checkpoint advance.
  const officialCheckpointStale = officialDuelComparisonAvailable && officialDuelComparison
    ? isOfficialDuelCheckpointStale(
        duelMatchStatus?.matchId ?? 'duel',
        officialDuelComparison.elapsedSeconds,
        nowMs,
      )
    : false;
  const officialDuelReady = officialDuelComparisonAvailable && !officialCheckpointStale;
  const officialDuelComparisonSnapshot = officialDuelReady && officialDuelComparison
    ? buildOfficialDuelComparisonSnapshot({
        officialDuelComparison,
        officialOpponentDistanceKm: duelOpponentProgressModel.officialProgress?.distanceKm ?? 0,
      })
    : fallbackDuelComparisonSnapshot;
  const shouldUseLiveSurvivorDistance = shouldPreferSurvivorLiveDistance(duelMatchStatus, effectiveDuelOpponent);
  const duelComparisonSnapshot = (
    shouldUseLiveSurvivorDistance
    && officialDuelComparisonSnapshot
    && officialDuelComparisonSnapshot.currentDistanceKm < distanceKm
  )
    ? {
        ...officialDuelComparisonSnapshot,
        currentDistanceKm: distanceKm,
        gapKm: Number((distanceKm - officialDuelComparisonSnapshot.opponentDistanceKm).toFixed(2)),
      }
    : officialDuelComparisonSnapshot;
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
