import type { MatchStatusAlert } from '@/features/runs/components/liveMatchTracking/types';
import type { GroupLiveStanding } from '@/features/runs/viewModels/matchProgress';
import type { DuelMatchOpponent } from '@/lib/api/types';

export type GroupProgressSnapshot = {
  currentGroupStanding: GroupLiveStanding | null;
  currentGroupLeader: GroupLiveStanding | null;
  groupAheadParticipant: GroupLiveStanding | null;
  groupBehindParticipant: GroupLiveStanding | null;
  featuredGroupArenaParticipantIds: Set<string>;
  groupStatusAlert: MatchStatusAlert | null;
};

export function buildGroupStatusAlert(groupLiveStandings: GroupLiveStanding[]): MatchStatusAlert | null {
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
      tone: 'danger',
      title: titleParts.join(' · '),
      summary: forfeitedCount > 0
        ? '남은 러너 기준으로 순위가 다시 정리되고 있어요.'
        : '잠시 뒤 자동 정리되거나 순위 구성이 다시 달라질 수 있어요.',
    };
  }

  return {
    tone: 'warning',
    title: `백그라운드 ${backgroundCount}명 · 일시정지 ${pausedCount}명`,
    summary: '앱으로 돌아오거나 다시 달리면 실시간 순위가 계속 갱신돼요.',
  };
}

export function buildGroupProgressSnapshot(groupLiveStandings: GroupLiveStanding[]): GroupProgressSnapshot {
  const currentGroupStanding = groupLiveStandings.find((participant) => participant.isCurrentUser) ?? null;
  const currentGroupLeader = groupLiveStandings[0] ?? null;
  const groupAheadParticipant = currentGroupStanding
    ? groupLiveStandings.find((participant) => participant.rank === currentGroupStanding.rank - 1) ?? null
    : null;
  const groupBehindParticipant = currentGroupStanding
    ? groupLiveStandings.find((participant) => participant.rank === currentGroupStanding.rank + 1) ?? null
    : null;
  const featuredGroupArenaParticipantIds = new Set<string>();

  groupLiveStandings.slice(0, 3).forEach((participant) => featuredGroupArenaParticipantIds.add(participant.id));
  if (currentGroupStanding) {
    featuredGroupArenaParticipantIds.add(currentGroupStanding.id);
  }
  if (groupAheadParticipant) {
    featuredGroupArenaParticipantIds.add(groupAheadParticipant.id);
  }
  if (groupBehindParticipant) {
    featuredGroupArenaParticipantIds.add(groupBehindParticipant.id);
  }

  return {
    currentGroupStanding,
    currentGroupLeader,
    groupAheadParticipant,
    groupBehindParticipant,
    featuredGroupArenaParticipantIds,
    groupStatusAlert: buildGroupStatusAlert(groupLiveStandings),
  };
}

export function buildDuelStatusAlert(opponent: DuelMatchOpponent | null): MatchStatusAlert | null {
  if (!opponent?.liveStatus || ['running', 'finished'].includes(opponent.liveStatus)) {
    return null;
  }

  if (opponent.liveStatus === 'forfeited') {
    return {
      tone: 'danger',
      title: '상대가 매치를 포기했어요',
      summary: '이제 혼자 이어서 달리거나 바로 결과를 정리할 수 있어요.',
    };
  }

  if (opponent.liveStatus === 'disconnected') {
    return {
      tone: 'danger',
      title: '상대 연결이 끊겼어요',
      summary: '잠시 뒤 자동 정리되거나 다시 찾기 흐름으로 넘어갈 수 있어요.',
    };
  }

  if (opponent.liveStatus === 'background') {
    return {
      tone: 'warning',
      title: '상대가 백그라운드 상태예요',
      summary: '앱으로 돌아오면 진행 상태가 다시 이어서 반영돼요.',
    };
  }

  if (opponent.liveStatus === 'paused') {
    return {
      tone: 'warning',
      title: '상대가 잠시 멈췄어요',
      summary: '다시 움직이기 시작하면 거리 차이도 이어서 갱신돼요.',
    };
  }

  return {
    tone: 'neutral',
    title: '상대 상태를 다시 확인 중이에요',
    summary: '곧 최신 상태로 반영될 거예요.',
  };
}

export function buildDuelLiveTitle({
  isDuelOpponentForfeited,
  duelLiveGapKm,
}: {
  isDuelOpponentForfeited: boolean;
  duelLiveGapKm: number | null;
}) {
  if (isDuelOpponentForfeited) {
    return '상대가 기권했어요';
  }

  if (duelLiveGapKm === null) {
    return '서버 공식 판정 준비 중';
  }

  return duelLiveGapKm >= 0
    ? `${duelLiveGapKm.toFixed(2)}km 앞서고 있어요`
    : `${Math.abs(duelLiveGapKm).toFixed(2)}km 따라가는 중이에요`;
}
