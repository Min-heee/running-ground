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
  // 내 행과 상대 행은 **같은 기준**에서 나온 숫자여야 한다.
  //
  // 여기를 내 로컬 거리로 바닥 깔아 보려던 시도가 있었다(깨어났을 때 내 기록보다 내 행이
  // 0.3~0.4km 뒤처져 보이던 증상). 그러면 보드의 두 숫자가 서로 다른 기준이 되고, 순위는
  // 그 두 숫자로 정해지므로 "1위 나 5.61km / 2위 상대 5.40km" 위에 "0.12km 따라가는 중"이
  // 같이 뜨는 자기모순 화면이 만들어진다 — 잠금카드에서 방금 없앤 것과 정확히 같은 죄다.
  //
  // 그 뒤처짐의 진짜 원인은 표시가 아니라 **전송**이다: 서버는 두 사람이 공유하는 경과
  // 시각(둘 중 늦게 보고한 쪽)으로 거리를 되돌려 비교하는데, 상대 폰이 잠들어 보고가 끊기면
  // 내 숫자가 그 침묵만큼 비례로 깎인다. 그래서 고칠 곳은 두 군데다 — 잠금 순간 네이티브
  // 전송을 확실히 깨우는 것(useTrackingAppStateSync), 그리고 긴 러닝이 체크포인트 격자를
  // 벗어나 이 투영 경로로 떨어지지 않게 하는 것(backend MATCH_CHECKPOINT_MAX).
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
