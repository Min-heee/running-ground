import type { LiveMatchArenaProps } from '@/components/matches/LiveMatchArena';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  formatArenaPaceChip,
  type DuelComparisonSnapshot,
  type GroupLiveStanding,
  resolveParticipantDisplayDistanceKm,
} from '@/features/runs/viewModels/matchProgress';
import { resolveOpponentForfeitTitle } from '@/features/runs/viewModels/matchForfeitLabels';
import type { ArenaParticipantViewModel } from '@/features/runs/viewModels/matchViewModels';
import { formatDuration } from '@/features/runs/tracking';
import type { DuelMatchOpponent, RunningMatchRoom } from '@/lib/api/types';
import { formatMatchCountdown } from '@/lib/matchCountdown';

export type LiveMatchArenaViewModel = Omit<LiveMatchArenaProps, 'onMounted'>;

export type LiveMatchArenaViewModelInput = {
  activeMatchId?: string | null;
  matchMode: RunMatchMode;
  effectiveDuelOpponent: DuelMatchOpponent | null;
  duelDistanceKm: number;
  groupDistanceKm: number;
  distanceKm: number;
  duelLiveSummary: string;
  currentUserArenaPace: string;
  isDuelOpponentForfeited: boolean;
  effectiveDuelOpponentArenaPace: string;
  duelComparisonSnapshot: DuelComparisonSnapshot | null;
  officialDuelReady: boolean;
  duelLiveGapKm: number | null;
  duelArenaParticipants: ArenaParticipantViewModel[];
  syncedDuelDistanceKm: number;
  syncedDuelOpponentDistanceKm: number;
  roomLinkedDuelPlaceholderParticipants: ArenaParticipantViewModel[];
  roomLinkedDuelCurrentParticipant: ArenaParticipantViewModel | null;
  roomLinkedDuelOpponentParticipant: ArenaParticipantViewModel | null;
  roomLinkedGroupPlaceholderParticipants: ArenaParticipantViewModel[];
  visibleMatchRoom: RunningMatchRoom | null;
  roomCountdownRemainingSeconds: number | null;
  duelArenaUsesLivePace: boolean;
  hasRoomLinkedDuelLiveProgress: boolean;
  roomLinkedDuelGapKm: number | null;
  currentGroupStanding: GroupLiveStanding | null;
  effectiveGroupParticipantCount: number;
  currentGroupLeader: GroupLiveStanding | null;
  groupArenaParticipants: ArenaParticipantViewModel[];
  groupAheadParticipant: GroupLiveStanding | null;
  groupBehindParticipant: GroupLiveStanding | null;
  shouldKeepRunningMatchArena: boolean;
  currentUserDuelLiveStatus: DuelMatchOpponent['liveStatus'] | null;
  currentUserGroupLiveStatus: DuelMatchOpponent['liveStatus'] | null;
  // 오너 2026-08-28: 내 행도 무조건 닉네임 — '나'는 프로필 이름이 없을 때의 최후 폴백.
  currentUserName?: string | null;
  deferHeavyContent?: boolean;
};

export function buildLiveMatchArenaViewModel({
  activeMatchId,
  matchMode,
  effectiveDuelOpponent,
  duelDistanceKm,
  groupDistanceKm,
  distanceKm,
  duelLiveSummary,
  currentUserArenaPace,
  isDuelOpponentForfeited,
  effectiveDuelOpponentArenaPace,
  duelComparisonSnapshot,
  officialDuelReady,
  duelLiveGapKm,
  duelArenaParticipants,
  syncedDuelDistanceKm,
  syncedDuelOpponentDistanceKm,
  roomLinkedDuelPlaceholderParticipants,
  roomLinkedDuelCurrentParticipant,
  roomLinkedDuelOpponentParticipant,
  roomLinkedGroupPlaceholderParticipants,
  visibleMatchRoom,
  roomCountdownRemainingSeconds,
  duelArenaUsesLivePace,
  hasRoomLinkedDuelLiveProgress,
  roomLinkedDuelGapKm,
  currentGroupStanding,
  effectiveGroupParticipantCount,
  currentGroupLeader,
  groupArenaParticipants,
  groupAheadParticipant,
  groupBehindParticipant,
  shouldKeepRunningMatchArena,
  currentUserDuelLiveStatus,
  currentUserGroupLiveStatus,
  currentUserName,
  deferHeavyContent = false,
}: LiveMatchArenaViewModelInput): LiveMatchArenaViewModel | null {
  const hasRoomLinkedDuelForfeit = roomLinkedDuelPlaceholderParticipants.some((participant) => (
    participant.liveStatus === 'forfeited'
  ));

  if (matchMode === 'duel' && roomLinkedDuelPlaceholderParticipants.length === 2 && hasRoomLinkedDuelForfeit) {
    const placeholderOpponent = roomLinkedDuelOpponentParticipant;
    const placeholderDistanceKm = visibleMatchRoom?.linkedMatchDistanceKm ?? visibleMatchRoom?.distanceKm ?? duelDistanceKm;

    return {
      mode: 'duel',
      matchId: activeMatchId,
      targetDistanceKm: placeholderDistanceKm,
      title: `${placeholderOpponent?.name ?? '상대'}님과 1대1 대결`,
      // Duel arena no longer shows the opponent-pace subtitle or the 내 페이스 /
      // 상대 페이스 / 서버 기준 summary chips — only the title + road remain.
      subtitle: '',
      summaryChips: [],
      deferHeavyContent,
      participants: roomLinkedDuelPlaceholderParticipants,
      footer: placeholderOpponent?.liveStatus === 'forfeited'
        ? `${resolveOpponentForfeitTitle(placeholderOpponent.disqualified)}. 내 러닝 기록은 계속 저장돼요.`
        : '기권 상태를 동기화하고 있어요.',
    };
  }

  if (matchMode === 'duel' && effectiveDuelOpponent) {
    return {
      mode: 'duel',
      matchId: activeMatchId,
      targetDistanceKm: duelDistanceKm,
      title: `${effectiveDuelOpponent.name}님과 1대1 대결`,
      // Duel arena no longer shows the "상대 [pace] 페이스 러닝중" subtitle or the
      // 내 페이스 / 상대 페이스 / 서버 기준 summary chips — only the title + road remain.
      subtitle: '',
      summaryChips: [],
      deferHeavyContent,
      participants: duelArenaParticipants,
      footer: isDuelOpponentForfeited
        ? (effectiveDuelOpponent.disqualified === true
          ? '상대가 부정 러닝으로 실격됐어요. 상대 동그라미는 실격 상태로 고정되고, 내 러닝 기록은 계속 저장돼요.'
          : '상대가 기권했어요. 상대 동그라미는 기권 상태로 고정되고, 내 러닝 기록은 계속 저장돼요.')
        : duelLiveGapKm === null
        ? '서버가 양쪽 기록을 받은 뒤 같은 기준 시간의 공식 거리로 비교해요.'
        : `${duelComparisonSnapshot ? (officialDuelReady ? '서버 공식' : '동기화') : '실시간 수신'} ${duelComparisonSnapshot ? `${formatDuration(duelComparisonSnapshot.checkpointSeconds)} 기준 · ` : ''}내 ${syncedDuelDistanceKm.toFixed(2)}km · 상대 ${syncedDuelOpponentDistanceKm.toFixed(2)}km`,
    };
  }

  if (matchMode === 'duel' && roomLinkedDuelPlaceholderParticipants.length === 2) {
    const placeholderOpponent = roomLinkedDuelOpponentParticipant;
    const placeholderDistanceKm = visibleMatchRoom?.linkedMatchDistanceKm ?? visibleMatchRoom?.distanceKm ?? duelDistanceKm;

    return {
      mode: 'duel',
      matchId: activeMatchId,
      targetDistanceKm: placeholderDistanceKm,
      title: `${placeholderOpponent?.name ?? '상대'}님과 1대1 대결`,
      // Duel arena no longer shows a subtitle or the duel summary chips.
      subtitle: '',
      summaryChips: [],
      deferHeavyContent,
      participants: roomLinkedDuelPlaceholderParticipants,
      footer: hasRoomLinkedDuelLiveProgress && roomLinkedDuelCurrentParticipant && roomLinkedDuelOpponentParticipant
        ? `실시간 수신 · 내 ${roomLinkedDuelCurrentParticipant.distanceKm.toFixed(2)}km · 상대 ${roomLinkedDuelOpponentParticipant.distanceKm.toFixed(2)}km`
        : '상대와 같은 대결방에 연결됐어요. 카운트다운이 끝나면 거리 비교가 시작돼요.',
    };
  }

  if (matchMode === 'group' && currentGroupStanding) {
    return {
      mode: 'group',
      matchId: activeMatchId,
      targetDistanceKm: groupDistanceKm,
      title: `${effectiveGroupParticipantCount}명 그룹 대결`,
      // Group arena drops the header subtitle (analogous to the duel cleanup) but
      // KEEPS the group summary chips (내 페이스 / 현재 N위 / 선두 …).
      subtitle: '',
      summaryChips: [
        formatArenaPaceChip('내 페이스', currentUserArenaPace),
        `현재 ${currentGroupStanding.rank}/${effectiveGroupParticipantCount}위`,
        currentGroupLeader ? `선두 ${currentGroupLeader.name} · ${currentGroupLeader.currentDistanceKm.toFixed(2)}km` : '선두 동기화 중',
      ],
      deferHeavyContent,
      participants: groupArenaParticipants,
      footer: groupAheadParticipant
        ? `앞 사람 ${groupAheadParticipant.name} · ${currentGroupStanding.gapAheadKm?.toFixed(2) ?? '0.00'}km 차이`
        : groupBehindParticipant
          ? `뒤 사람 ${groupBehindParticipant.name}보다 ${groupBehindParticipant.gapAheadKm?.toFixed(2) ?? '0.00'}km 앞서 있어요.`
          : '참가자 상태를 계속 정리하고 있어요.',
    };
  }

  if (matchMode === 'group' && roomLinkedGroupPlaceholderParticipants.length > 0) {
    const placeholderDistanceKm = visibleMatchRoom?.linkedMatchDistanceKm ?? visibleMatchRoom?.distanceKm ?? groupDistanceKm;

    return {
      mode: 'group',
      matchId: activeMatchId,
      targetDistanceKm: placeholderDistanceKm,
      title: `${roomLinkedGroupPlaceholderParticipants.length}명 그룹 대결`,
      // Group arena drops the header subtitle but keeps the group summary chips.
      subtitle: '',
      summaryChips: [
        formatArenaPaceChip('내 페이스', currentUserArenaPace),
        `${roomLinkedGroupPlaceholderParticipants.length}명 연결됨`,
        typeof roomCountdownRemainingSeconds === 'number'
          ? `시작까지 ${formatMatchCountdown(roomCountdownRemainingSeconds)}`
          : '곧 시작',
      ],
      deferHeavyContent,
      participants: roomLinkedGroupPlaceholderParticipants,
      footer: '참가자와 같은 대결방에 연결됐어요. 카운트다운이 끝나면 순위 비교가 시작돼요.',
    };
  }

  if (matchMode === 'duel' && shouldKeepRunningMatchArena) {
    const placeholderDistanceKm = visibleMatchRoom?.linkedMatchDistanceKm ?? visibleMatchRoom?.distanceKm ?? duelDistanceKm;
    const opponentName = roomLinkedDuelOpponentParticipant?.name ?? effectiveDuelOpponent?.name ?? '상대';
    const opponentDistanceKm = roomLinkedDuelOpponentParticipant?.distanceKm
      ?? (effectiveDuelOpponent ? resolveParticipantDisplayDistanceKm(effectiveDuelOpponent, placeholderDistanceKm) : 0);
    const opponentPaceLabel = roomLinkedDuelOpponentParticipant?.paceLabel
      ?? effectiveDuelOpponentArenaPace
      ?? '동기화 중';

    return {
      mode: 'duel',
      matchId: activeMatchId,
      targetDistanceKm: placeholderDistanceKm,
      title: `${opponentName}님과 1대1 대결`,
      // Duel arena no longer shows a subtitle or the duel summary chips.
      subtitle: '',
      summaryChips: [],
      deferHeavyContent,
      participants: [
        {
          id: 'duel-fallback-opponent',
          name: opponentName,
          paceLabel: opponentPaceLabel,
          distanceKm: opponentDistanceKm,
          resultLabel: roomLinkedDuelOpponentParticipant?.resultLabel ?? null,
          finishedAt: roomLinkedDuelOpponentParticipant?.finishedAt ?? effectiveDuelOpponent?.finishedAt ?? null,
          isLeader: opponentDistanceKm > distanceKm,
          liveStatus: roomLinkedDuelOpponentParticipant?.liveStatus ?? effectiveDuelOpponent?.liveStatus,
          showPaceBubble: Boolean(opponentPaceLabel),
        },
        {
          id: 'duel-fallback-current',
          name: currentUserName?.trim() || '나',
          paceLabel: currentUserArenaPace,
          distanceKm,
          resultLabel: roomLinkedDuelCurrentParticipant?.resultLabel ?? null,
          finishedAt: roomLinkedDuelCurrentParticipant?.finishedAt ?? null,
          isCurrentUser: true,
          isLeader: distanceKm >= opponentDistanceKm,
          liveStatus: currentUserDuelLiveStatus ?? undefined,
          showPaceBubble: Boolean(currentUserArenaPace),
        },
      ],
      footer: '서버 응답이 잠깐 흔들려도 측정 화면으로 빠지지 않고 대결 화면을 유지해요.',
    };
  }

  if (matchMode === 'group' && shouldKeepRunningMatchArena) {
    const placeholderDistanceKm = visibleMatchRoom?.linkedMatchDistanceKm ?? visibleMatchRoom?.distanceKm ?? groupDistanceKm;
    const fallbackGroupParticipants: ArenaParticipantViewModel[] = roomLinkedGroupPlaceholderParticipants.length
      ? roomLinkedGroupPlaceholderParticipants
      : [
          {
            id: 'group-fallback-current',
            name: currentUserName?.trim() || '나',
            paceLabel: currentUserArenaPace,
            distanceKm,
            rankLabel: '1',
            isCurrentUser: true,
            isLeader: true,
            liveStatus: currentUserGroupLiveStatus ?? undefined,
            showPaceBubble: Boolean(currentUserArenaPace),
            emphasis: 'featured',
          },
        ];

    return {
      mode: 'group',
      matchId: activeMatchId,
      targetDistanceKm: placeholderDistanceKm,
      title: '그룹 대결',
      // Group arena drops the header subtitle but keeps the group summary chips.
      subtitle: '',
      summaryChips: [
        formatArenaPaceChip('내 페이스', currentUserArenaPace),
        `${fallbackGroupParticipants.length}명 연결 확인 중`,
        '대결 화면 유지 중',
      ],
      deferHeavyContent,
      participants: fallbackGroupParticipants,
      footer: '서버 응답이 잠깐 흔들려도 측정 화면으로 빠지지 않고 대결 화면을 유지해요.',
    };
  }

  return null;
}
