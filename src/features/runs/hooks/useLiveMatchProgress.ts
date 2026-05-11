import { useMemo } from 'react';
import {
  type DuelMatchOpponent,
  type GroupMatchParticipant,
  type RunningMatchRoom,
  type RunningMatchStatusResponse,
} from '@/lib/api/types';
import {
  buildDuelComparisonSnapshot,
  buildGroupLiveStandings,
  hasRemoteRunnerProgress,
  resolveParticipantDisplayDistanceKm,
  type LastSyncedMatchProgress,
} from '@/features/runs/matchProgress';
import { type RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';

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
}: UseLiveMatchProgressInput) {
  const groupLiveStandings = useMemo(
    () => buildGroupLiveStandings(effectiveGroupParticipants, effectiveGroupSeedRank, distanceKm, elapsedSeconds, groupDistanceKm),
    [distanceKm, elapsedSeconds, effectiveGroupParticipants, effectiveGroupSeedRank, groupDistanceKm],
  );
  const currentGroupStanding = groupLiveStandings.find((participant) => participant.isCurrentUser) ?? null;
  const currentUserDuelLiveStatus = duelMatchStatus?.currentUserLiveStatus ?? null;
  const currentUserGroupLiveStatus = groupMatchStatus?.currentUserLiveStatus ?? currentGroupStanding?.liveStatus ?? null;
  const currentUserHasForfeitedActiveMatch = (
    matchMode === 'duel'
      ? currentUserDuelLiveStatus === 'forfeited'
      : matchMode === 'group'
        ? currentUserGroupLiveStatus === 'forfeited'
        : false
  );
  const currentGroupLeader = groupLiveStandings[0] ?? null;
  const groupAheadParticipant = currentGroupStanding
    ? groupLiveStandings.find((participant) => participant.rank === currentGroupStanding.rank - 1) ?? null
    : null;
  const groupBehindParticipant = currentGroupStanding
    ? groupLiveStandings.find((participant) => participant.rank === currentGroupStanding.rank + 1) ?? null
    : null;
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
  const officialDuelComparison = duelMatchStatus?.officialComparison ?? null;
  const isDuelOpponentForfeited = effectiveDuelOpponent?.liveStatus === 'forfeited';
  const officialDuelReady = Boolean(
    officialDuelComparison
    && officialDuelComparison.readyParticipantCount >= 2
    && typeof officialDuelComparison.userDistanceKm === 'number'
    && effectiveDuelOpponent?.officialReady
    && typeof effectiveDuelOpponent.officialDistanceKm === 'number',
  );
  const duelComparisonSnapshot = officialDuelReady
    ? {
        checkpointSeconds: officialDuelComparison?.elapsedSeconds ?? 0,
        currentDistanceKm: officialDuelComparison?.userDistanceKm ?? 0,
        opponentDistanceKm: effectiveDuelOpponent?.officialDistanceKm ?? 0,
        gapKm: Number(((officialDuelComparison?.userDistanceKm ?? 0) - (effectiveDuelOpponent?.officialDistanceKm ?? 0)).toFixed(2)),
      }
    : fallbackDuelComparisonSnapshot;
  const rawDuelOpponentDistanceKm = resolveParticipantDisplayDistanceKm(effectiveDuelOpponent, duelDistanceKm);
  const hasDuelOpponentDisplayProgress = Boolean(
    duelComparisonSnapshot || hasRemoteRunnerProgress(effectiveDuelOpponent),
  );
  const syncedDuelDistanceKm = duelComparisonSnapshot?.currentDistanceKm ?? distanceKm;
  const syncedDuelOpponentDistanceKm = duelComparisonSnapshot?.opponentDistanceKm ?? rawDuelOpponentDistanceKm;
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
  const groupStatusAlert = useMemo(() => {
    const others = groupLiveStandings.filter((participant) => !participant.isCurrentUser);
    const forfeitedCount = others.filter((participant) => participant.liveStatus === 'forfeited').length;
    const disconnectedCount = others.filter((participant) => participant.liveStatus === 'disconnected').length;
    const backgroundCount = others.filter((participant) => participant.liveStatus === 'background').length;
    const pausedCount = others.filter((participant) => participant.liveStatus === 'paused').length;

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
  }, [groupLiveStandings]);

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
