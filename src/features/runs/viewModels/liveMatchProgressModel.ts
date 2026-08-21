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
  // 내 행 거리는 **내가 실제로 뛴 거리 아래로 내려가지 않는다**.
  //
  // 공식 비교값은 두 사람이 공유하는 '같은 경과 시각'으로 되돌려 계산한 값이다(서버:
  // officialElapsed = 두 사람의 마지막 보고 경과 중 작은 쪽). 그래서 상대의 통신이 잠깐
  // 조용하면 **내 숫자가 그 침묵만큼 비례로 깎인다** — 화면이 꺼져 있던 쪽이 90초 문턱까지
  // 밀리면 파티런 속도로 0.3~0.4km, 오너가 깨울 때마다 본 그 값이다. 잠시 뒤 다시 같아지는
  // 것도 같은 공식이 제자리를 찾는 과정이었다.
  //
  // 공유 기준은 **머리를 맞댄 간격**을 공정하게 만들려고 있는 것이지, 같은 화면의 내 기록과
  // 내 행을 어긋나게 하려고 있는 게 아니다. 그래서 내 행만 바닥을 깐다. 간격(duelLiveGapKm)과
  // 상대 거리는 서버 기준 그대로 두어 승부 판정과 어긋나지 않게 한다.
  const syncedDuelDistanceKm = Math.max(
    duelComparisonSnapshot?.currentDistanceKm ?? 0,
    distanceKm,
  );
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
