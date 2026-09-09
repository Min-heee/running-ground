import type { MatchStatusAlert } from '@/features/runs/components/liveMatchTracking/types';
import type { RunMatchMode } from '@/features/runs/hooks/matchLifecycle/types';
import { resolveOpponentForfeitTitle } from '@/features/runs/viewModels/matchForfeitLabels';
import {
  buildGroupLiveStandingRows,
  buildGroupLiveStandings,
  type GroupLiveStanding,
} from '@/features/runs/viewModels/matchProgress';
import type { DuelMatchOpponent, GroupMatchParticipant } from '@/lib/api/types';

export type GroupProgressSnapshot = {
  currentGroupStanding: GroupLiveStanding | null;
  currentGroupLeader: GroupLiveStanding | null;
  groupAheadParticipant: GroupLiveStanding | null;
  groupBehindParticipant: GroupLiveStanding | null;
  featuredGroupArenaParticipantIds: Set<string>;
  groupStatusAlert: MatchStatusAlert | null;
};

export type GroupLiveProgressModel = GroupProgressSnapshot & {
  groupLiveStandings: GroupLiveStanding[];
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

export function buildGroupLiveProgressModel({
  deferRankingCalculations,
  matchMode,
  participants,
  seedRank,
  distanceKm,
  targetDistanceKm,
}: {
  deferRankingCalculations: boolean;
  matchMode: RunMatchMode;
  participants: GroupMatchParticipant[];
  seedRank?: number;
  distanceKm: number;
  targetDistanceKm: number;
}): GroupLiveProgressModel {
  // Bundle A1 — never blank the group rows. The group board must render every
  // participant with their real live distance on BOTH platforms, the same way the duel
  // board renders the opponent (and is never gated). What the startup gate may defer is
  // ONLY the heavy O(n log n) rank/gap decoration, never the row existence or the live
  // distance. So when deferRankingCalculations is up we emit the bare rows (participants
  // + live distances, stable seed order, neutral rank 0 / gap null) and skip ONLY the
  // sort + rank assignment + leader/ahead gap pass; once the gate settles the full
  // decorated standings take over. Non-group modes are untouched.
  const shouldDeferDecoration = deferRankingCalculations && matchMode === 'group';
  const groupLiveStandings = shouldDeferDecoration
    ? buildGroupLiveStandingRows(participants, seedRank, distanceKm, targetDistanceKm)
    : buildGroupLiveStandings(participants, seedRank, distanceKm, targetDistanceKm);

  // While decoration is deferred, the rank-derived snapshot (leader / ahead / behind /
  // featured arena ids / rank-keyed status alert) would be meaningless against neutral
  // rank-0 rows — and fabricating it would surface bogus ranks. So we expose the SAME
  // neutral pending snapshot the pre-start group board shows: rows are present with live
  // distances, but no leader/ahead/behind/rank framing until the gate settles.
  if (shouldDeferDecoration) {
    return {
      groupLiveStandings,
      currentGroupStanding: null,
      currentGroupLeader: null,
      groupAheadParticipant: null,
      groupBehindParticipant: null,
      featuredGroupArenaParticipantIds: new Set<string>(),
      groupStatusAlert: buildGroupStatusAlert(groupLiveStandings),
    };
  }

  return {
    groupLiveStandings,
    ...buildGroupProgressSnapshot(groupLiveStandings),
  };
}

export function buildDuelStatusAlert(opponent: DuelMatchOpponent | null): MatchStatusAlert | null {
  if (!opponent?.liveStatus || ['running', 'finished'].includes(opponent.liveStatus)) {
    return null;
  }

  if (opponent.liveStatus === 'forfeited') {
    return {
      tone: 'danger',
      title: opponent.disqualified === true ? '상대가 부정 러닝으로 실격됐어요' : '상대가 매치를 포기했어요',
      summary: '대결종료를 눌러 지금까지 기록을 저장하고 결과를 확인하세요.',
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
  isDuelOpponentDisqualified = false,
  duelLiveGapKm,
}: {
  isDuelOpponentForfeited: boolean;
  // 상대의 기권이 부정 러닝 실격이면 '상대가 실격됐어요'.
  isDuelOpponentDisqualified?: boolean;
  duelLiveGapKm: number | null;
}) {
  if (isDuelOpponentForfeited) {
    return resolveOpponentForfeitTitle(isDuelOpponentDisqualified);
  }

  if (duelLiveGapKm === null) {
    return '서버 공식 판정 준비 중';
  }

  return duelLiveGapKm >= 0
    ? `${duelLiveGapKm.toFixed(2)}km 앞서고 있어요`
    : `${Math.abs(duelLiveGapKm).toFixed(2)}km 따라가는 중이에요`;
}
