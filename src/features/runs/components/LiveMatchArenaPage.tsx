import { memo } from 'react';
import { LiveMatchArena } from '@/components/matches/LiveMatchArena';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  buildDistanceGapLabel,
  formatArenaPaceChip,
  resolveParticipantDisplayDistanceKm,
  type DuelComparisonSnapshot,
  type GroupLiveStanding,
} from '@/features/runs/matchProgress';
import type { ArenaParticipantViewModel } from '@/features/runs/matchViewModels';
import { formatDuration } from '@/features/runs/tracking';
import { formatMatchCountdown } from '@/lib/matchCountdown';
import type { DuelMatchOpponent, RunningMatchRoom } from '@/lib/api/types';

export type LiveMatchArenaPageProps = {
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
};

export const LiveMatchArenaPage = memo(function LiveMatchArenaPage({
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
}: LiveMatchArenaPageProps) {
  if (matchMode === 'duel' && effectiveDuelOpponent) {
    return (
      <LiveMatchArena
        mode="duel"
        targetDistanceKm={duelDistanceKm}
        title={`${effectiveDuelOpponent.name}님과 1대1 대결`}
        subtitle={duelLiveSummary}
        summaryChips={[
          formatArenaPaceChip('내 페이스', currentUserArenaPace),
          isDuelOpponentForfeited
            ? '상대 기권'
            : formatArenaPaceChip('상대 페이스', effectiveDuelOpponentArenaPace),
          isDuelOpponentForfeited
            ? '내 기록은 계속 저장'
            : duelComparisonSnapshot
            ? `${officialDuelReady ? '서버' : '동기화'} ${formatDuration(duelComparisonSnapshot.checkpointSeconds)} 기준 ${buildDistanceGapLabel(duelLiveGapKm)}`
            : duelLiveGapKm !== null
              ? `실시간 수신 ${buildDistanceGapLabel(duelLiveGapKm)}`
              : buildDistanceGapLabel(null),
        ]}
        participants={duelArenaParticipants}
        footer={
          isDuelOpponentForfeited
            ? '상대가 기권했어요. 상대 동그라미는 기권 상태로 고정되고, 내 러닝 기록은 계속 저장돼요.'
            : duelLiveGapKm === null
            ? '서버가 양쪽 기록을 받은 뒤 같은 기준 시간의 공식 거리로 비교해요.'
            : `${duelComparisonSnapshot ? (officialDuelReady ? '서버 공식' : '동기화') : '실시간 수신'} ${duelComparisonSnapshot ? `${formatDuration(duelComparisonSnapshot.checkpointSeconds)} 기준 · ` : ''}내 ${syncedDuelDistanceKm.toFixed(2)}km · 상대 ${syncedDuelOpponentDistanceKm.toFixed(2)}km`
        }
      />
    );
  }

  if (matchMode === 'duel' && roomLinkedDuelPlaceholderParticipants.length === 2) {
    const placeholderOpponent = roomLinkedDuelOpponentParticipant;
    const placeholderDistanceKm = visibleMatchRoom?.linkedMatchDistanceKm ?? visibleMatchRoom?.distanceKm ?? duelDistanceKm;

    return (
      <LiveMatchArena
        mode="duel"
        targetDistanceKm={placeholderDistanceKm}
        title={`${placeholderOpponent?.name ?? '상대'}님과 1대1 대결`}
        subtitle="대결 정보를 맞추는 중이에요."
        summaryChips={[
          formatArenaPaceChip('내 페이스', currentUserArenaPace),
          formatArenaPaceChip('상대 페이스', placeholderOpponent?.paceLabel ?? ''),
          typeof roomCountdownRemainingSeconds === 'number' && !duelArenaUsesLivePace
            ? `시작까지 ${formatMatchCountdown(roomCountdownRemainingSeconds)}`
            : hasRoomLinkedDuelLiveProgress
              ? `실시간 수신 ${buildDistanceGapLabel(roomLinkedDuelGapKm)}`
              : buildDistanceGapLabel(null),
        ]}
        participants={roomLinkedDuelPlaceholderParticipants}
        footer={
          hasRoomLinkedDuelLiveProgress && roomLinkedDuelCurrentParticipant && roomLinkedDuelOpponentParticipant
            ? `실시간 수신 · 내 ${roomLinkedDuelCurrentParticipant.distanceKm.toFixed(2)}km · 상대 ${roomLinkedDuelOpponentParticipant.distanceKm.toFixed(2)}km`
            : '상대와 같은 대결방에 연결됐어요. 카운트다운이 끝나면 거리 비교가 시작돼요.'
        }
      />
    );
  }

  if (matchMode === 'group' && currentGroupStanding) {
    return (
      <LiveMatchArena
        mode="group"
        targetDistanceKm={groupDistanceKm}
        title={`${effectiveGroupParticipantCount}명 그룹 대결`}
        subtitle={
          currentGroupStanding.rank === 1
            ? '지금은 선두예요. 흐름을 유지해보세요.'
            : `현재 ${currentGroupStanding.rank}/${effectiveGroupParticipantCount}위 · 앞 사람과 ${currentGroupStanding.gapAheadKm?.toFixed(2) ?? '0.00'}km 차이`
        }
        summaryChips={[
          formatArenaPaceChip('내 페이스', currentUserArenaPace),
          `현재 ${currentGroupStanding.rank}/${effectiveGroupParticipantCount}위`,
          currentGroupLeader ? `선두 ${currentGroupLeader.name} · ${currentGroupLeader.currentDistanceKm.toFixed(2)}km` : '선두 동기화 중',
        ]}
        participants={groupArenaParticipants}
        footer={
          groupAheadParticipant
            ? `앞 사람 ${groupAheadParticipant.name} · ${currentGroupStanding.gapAheadKm?.toFixed(2) ?? '0.00'}km 차이`
            : groupBehindParticipant
              ? `뒤 사람 ${groupBehindParticipant.name}보다 ${groupBehindParticipant.gapAheadKm?.toFixed(2) ?? '0.00'}km 앞서 있어요.`
              : '참가자 상태를 계속 정리하고 있어요.'
        }
      />
    );
  }

  if (matchMode === 'group' && roomLinkedGroupPlaceholderParticipants.length > 0) {
    const placeholderDistanceKm = visibleMatchRoom?.linkedMatchDistanceKm ?? visibleMatchRoom?.distanceKm ?? groupDistanceKm;

    return (
      <LiveMatchArena
        mode="group"
        targetDistanceKm={placeholderDistanceKm}
        title={`${roomLinkedGroupPlaceholderParticipants.length}명 그룹 대결`}
        subtitle="그룹 대결 정보를 맞추는 중이에요."
        summaryChips={[
          formatArenaPaceChip('내 페이스', currentUserArenaPace),
          `${roomLinkedGroupPlaceholderParticipants.length}명 연결됨`,
          typeof roomCountdownRemainingSeconds === 'number'
            ? `시작까지 ${formatMatchCountdown(roomCountdownRemainingSeconds)}`
            : '곧 시작',
        ]}
        participants={roomLinkedGroupPlaceholderParticipants}
        footer="참가자와 같은 대결방에 연결됐어요. 카운트다운이 끝나면 순위 비교가 시작돼요."
      />
    );
  }

  if (matchMode === 'duel' && shouldKeepRunningMatchArena) {
    const placeholderDistanceKm = visibleMatchRoom?.linkedMatchDistanceKm ?? visibleMatchRoom?.distanceKm ?? duelDistanceKm;
    const opponentName = roomLinkedDuelOpponentParticipant?.name ?? effectiveDuelOpponent?.name ?? '상대';
    const opponentDistanceKm = roomLinkedDuelOpponentParticipant?.distanceKm
      ?? (effectiveDuelOpponent ? resolveParticipantDisplayDistanceKm(effectiveDuelOpponent, placeholderDistanceKm) : 0);
    const opponentPaceLabel = roomLinkedDuelOpponentParticipant?.paceLabel
      ?? effectiveDuelOpponentArenaPace
      ?? '동기화 중';

    return (
      <LiveMatchArena
        mode="duel"
        targetDistanceKm={placeholderDistanceKm}
        title={`${opponentName}님과 1대1 대결`}
        subtitle="대결 화면을 유지하면서 기록 연결을 다시 맞추는 중이에요."
        summaryChips={[
          formatArenaPaceChip('내 페이스', currentUserArenaPace),
          formatArenaPaceChip('상대 페이스', opponentPaceLabel),
          '대결 화면 유지 중',
        ]}
        participants={[
          {
            id: 'duel-fallback-opponent',
            name: opponentName,
            paceLabel: opponentPaceLabel,
            distanceKm: opponentDistanceKm,
            isLeader: opponentDistanceKm > distanceKm,
            liveStatus: roomLinkedDuelOpponentParticipant?.liveStatus ?? effectiveDuelOpponent?.liveStatus,
            showPaceBubble: Boolean(opponentPaceLabel),
          },
          {
            id: 'duel-fallback-current',
            name: '나',
            paceLabel: currentUserArenaPace,
            distanceKm,
            isCurrentUser: true,
            isLeader: distanceKm >= opponentDistanceKm,
            liveStatus: currentUserDuelLiveStatus ?? undefined,
            showPaceBubble: Boolean(currentUserArenaPace),
          },
        ]}
        footer="서버 응답이 잠깐 흔들려도 측정 화면으로 빠지지 않고 대결 화면을 유지해요."
      />
    );
  }

  if (matchMode === 'group' && shouldKeepRunningMatchArena) {
    const placeholderDistanceKm = visibleMatchRoom?.linkedMatchDistanceKm ?? visibleMatchRoom?.distanceKm ?? groupDistanceKm;
    const fallbackGroupParticipants = roomLinkedGroupPlaceholderParticipants.length
      ? roomLinkedGroupPlaceholderParticipants
      : [
          {
            id: 'group-fallback-current',
            name: '나',
            paceLabel: currentUserArenaPace,
            distanceKm,
            rankLabel: '1',
            isCurrentUser: true,
            isLeader: true,
            liveStatus: currentUserGroupLiveStatus ?? undefined,
            showPaceBubble: Boolean(currentUserArenaPace),
            emphasis: 'featured' as const,
          },
        ];

    return (
      <LiveMatchArena
        mode="group"
        targetDistanceKm={placeholderDistanceKm}
        title="그룹 대결"
        subtitle="그룹 대결 화면을 유지하면서 참가자 기록을 다시 맞추는 중이에요."
        summaryChips={[
          formatArenaPaceChip('내 페이스', currentUserArenaPace),
          `${fallbackGroupParticipants.length}명 연결 확인 중`,
          '대결 화면 유지 중',
        ]}
        participants={fallbackGroupParticipants}
        footer="서버 응답이 잠깐 흔들려도 측정 화면으로 빠지지 않고 대결 화면을 유지해요."
      />
    );
  }

  return null;
});
