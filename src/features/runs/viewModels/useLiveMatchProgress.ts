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

function buildGroupStatusAlert(groupLiveStandings: ReturnType<typeof buildGroupLiveStandings>) {
  let forfeitedCount = 0;
  let disconnectedCount = 0;
  let backgroundCount = 0;
  let pausedCount = 0;

  for (const participant of groupLiveStandings) {
    if (participant.isCurrentUser) {
      continue;
    }

    if (participant.liveStatus === 'forfeited') {
      forfeitedCount += 1;
    } else if (participant.liveStatus === 'disconnected') {
      disconnectedCount += 1;
    } else if (participant.liveStatus === 'background') {
      backgroundCount += 1;
    } else if (participant.liveStatus === 'paused') {
      pausedCount += 1;
    }
  }

  if (!forfeitedCount && !disconnectedCount && !backgroundCount && !pausedCount) {
    return null;
  }

  if (forfeitedCount > 0 || disconnectedCount > 0) {
    const titleParts = [];
    if (forfeitedCount > 0) {
      titleParts.push(`포기 ${forfeitedCount}명`);
    }
    if (disconnectedCount > 0) {
      titleParts.push(`연결 끊김 ${disconnectedCount}명`);
    }
    return {
      tone: 'danger' as const,
      title: titleParts.join(' · '),
      summary: forfeitedCount > 0
        ? '남은 러너 기준으로 순위가 다시 정리되고 있어요.'
        : '잠시 뒤 자동 정리되거나 순위 구성이 다시 달라질 수 있어요.',
    };
  }

  return {
    tone: 'warning' as const,
    title: `백그라운드 ${backgroundCount}명 · 일시정지 ${pausedCount}명`,
    summary: '앱으로 돌아오거나 다시 달리면 실시간 순위가 계속 갱신돼요.',
  };
}

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
  const currentGroupStanding = useMemo(
    () => groupLiveStandings.find((participant) => participant.isCurrentUser) ?? null,
    [groupLiveStandings],
  );
  const currentUserDuelLiveStatus = duelMatchStatus?.currentUserLiveStatus ?? null;
  const currentUserGroupLiveStatus = groupMatchStatus?.currentUserLiveStatus ?? currentGroupStanding?.liveStatus ?? null;
  const currentUserHasForfeitedActiveMatch = (
    matchMode === 'duel'
      ? currentUserDuelLiveStatus === 'forfeited'
      : matchMode === 'group'
        ? currentUserGroupLiveStatus === 'forfeited'
        : false
  );
  const currentGroupLeader = useMemo(() => groupLiveStandings[0] ?? null, [groupLiveStandings]);
  const { groupAheadParticipant, groupBehindParticipant } = useMemo(() => ({
    groupAheadParticipant: currentGroupStanding
      ? groupLiveStandings.find((participant) => participant.rank === currentGroupStanding.rank - 1) ?? null
      : null,
    groupBehindParticipant: currentGroupStanding
      ? groupLiveStandings.find((participant) => participant.rank === currentGroupStanding.rank + 1) ?? null
      : null,
  }), [currentGroupStanding, groupLiveStandings]);
  const featuredGroupArenaParticipantIds = useMemo(() => {
    const ids = new Set<string>();
    groupLiveStandings.slice(0, 3).forEach((participant) => ids.add(participant.id));
    if (currentGroupStanding) {
      ids.add(currentGroupStanding.id);
    }
    if (groupAheadParticipant) {
      ids.add(groupAheadParticipant.id);
    }
    if (groupBehindParticipant) {
      ids.add(groupBehindParticipant.id);
    }
    return ids;
  }, [currentGroupStanding, groupAheadParticipant, groupBehindParticipant, groupLiveStandings]);

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
  const duelLiveTitle = isDuelOpponentForfeited
    ? '상대가 기권했어요'
    : duelLiveGapKm === null
    ? '서버 공식 판정 준비 중'
    : duelLiveGapKm >= 0
      ? `${duelLiveGapKm.toFixed(2)}km 앞서고 있어요`
      : `${Math.abs(duelLiveGapKm).toFixed(2)}km 따라가는 중이에요`;
  const duelStatusAlert = useMemo(() => {
    if (!effectiveDuelOpponent?.liveStatus || ['running', 'finished'].includes(effectiveDuelOpponent.liveStatus)) {
      return null;
    }

    if (effectiveDuelOpponent.liveStatus === 'forfeited') {
      return {
        tone: 'danger' as const,
        title: '상대가 매치를 포기했어요',
        summary: '이제 혼자 이어서 달리거나 바로 결과를 정리할 수 있어요.',
      };
    }

    if (effectiveDuelOpponent.liveStatus === 'disconnected') {
      return {
        tone: 'danger' as const,
        title: '상대 연결이 끊겼어요',
        summary: '잠시 뒤 자동 정리되거나 다시 찾기 흐름으로 넘어갈 수 있어요.',
      };
    }

    if (effectiveDuelOpponent.liveStatus === 'background') {
      return {
        tone: 'warning' as const,
        title: '상대가 백그라운드 상태예요',
        summary: '앱으로 돌아오면 진행 상태가 다시 이어서 반영돼요.',
      };
    }

    if (effectiveDuelOpponent.liveStatus === 'paused') {
      return {
        tone: 'warning' as const,
        title: '상대가 잠시 멈췄어요',
        summary: '다시 움직이기 시작하면 거리 차이도 이어서 갱신돼요.',
      };
    }

    return {
      tone: 'neutral' as const,
      title: '상대 상태를 다시 확인 중이에요',
      summary: '곧 최신 상태로 반영될 거예요.',
    };
  }, [effectiveDuelOpponent?.liveStatus]);
  const groupStatusAlert = useMemo(
    () => buildGroupStatusAlert(groupLiveStandings),
    [groupLiveStandings],
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
