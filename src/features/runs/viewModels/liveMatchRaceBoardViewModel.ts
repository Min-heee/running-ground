import type { LiveMatchRaceBoardRow } from '@/components/matches/LiveMatchRaceBoard';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  buildParticipantAveragePaceLabel,
  resolveParticipantDisplayDistanceKm,
  type GroupLiveStanding,
} from '@/features/runs/viewModels/matchProgress';
import type { ArenaParticipantViewModel } from '@/features/runs/viewModels/matchViewModels';
import type { DuelMatchOpponent, RunningMatchRoom } from '@/lib/api/types';

export type LiveMatchRaceBoardViewModel = {
  title: string;
  subtitle: string;
  rows: LiveMatchRaceBoardRow[];
};

export type LiveMatchRaceBoardViewModelInput = {
  matchMode: RunMatchMode;
  effectiveDuelOpponent: DuelMatchOpponent | null;
  duelLiveGapKm: number | null;
  duelDistanceKm: number;
  groupDistanceKm: number;
  distanceKm: number;
  syncedDuelDistanceKm: number;
  syncedDuelOpponentDistanceKm: number;
  currentUserDuelLiveStatus: DuelMatchOpponent['liveStatus'] | null;
  currentUserGroupLiveStatus: DuelMatchOpponent['liveStatus'] | null;
  roomLinkedDuelPlaceholderParticipants: ArenaParticipantViewModel[];
  roomLinkedGroupPlaceholderParticipants: ArenaParticipantViewModel[];
  visibleMatchRoom: RunningMatchRoom | null;
  groupLiveStandings: GroupLiveStanding[];
  currentUserArenaPace: string;
  groupArenaUsesLivePace: boolean;
};

type RaceBoardSourceRow = Omit<LiveMatchRaceBoardRow, 'rank'> & {
  rank?: number;
};

function sortRaceRows(rows: RaceBoardSourceRow[]): LiveMatchRaceBoardRow[] {
  return [...rows]
    .sort((left, right) => {
      const leftForfeited = left.liveStatus === 'forfeited';
      const rightForfeited = right.liveStatus === 'forfeited';

      if (leftForfeited !== rightForfeited) {
        return leftForfeited ? 1 : -1;
      }

      if (right.distanceKm !== left.distanceKm) {
        return right.distanceKm - left.distanceKm;
      }

      return left.isCurrentUser ? -1 : 1;
    })
    .map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
}

export function buildLiveMatchRaceBoardViewModel({
  matchMode,
  effectiveDuelOpponent,
  duelLiveGapKm,
  duelDistanceKm,
  groupDistanceKm,
  distanceKm,
  syncedDuelDistanceKm,
  syncedDuelOpponentDistanceKm,
  currentUserDuelLiveStatus,
  currentUserGroupLiveStatus,
  roomLinkedDuelPlaceholderParticipants,
  roomLinkedGroupPlaceholderParticipants,
  visibleMatchRoom,
  groupLiveStandings,
  currentUserArenaPace,
  groupArenaUsesLivePace,
}: LiveMatchRaceBoardViewModelInput): LiveMatchRaceBoardViewModel | null {
  if (matchMode === 'duel' && effectiveDuelOpponent) {
    const currentBoardDistanceKm = duelLiveGapKm === null ? distanceKm : syncedDuelDistanceKm;
    const opponentBoardDistanceKm = duelLiveGapKm === null
      ? resolveParticipantDisplayDistanceKm(effectiveDuelOpponent, duelDistanceKm)
      : syncedDuelOpponentDistanceKm;

    return {
      title: '1대1 레이스 보드',
      subtitle: '누가 더 앞서 있는지, 각각 얼마 남았는지 한눈에 볼 수 있어요.',
      rows: sortRaceRows([
        {
          id: 'current-user',
          name: '나',
          distanceKm: currentBoardDistanceKm,
          remainingKm: Math.max(0, duelDistanceKm - currentBoardDistanceKm),
          progress: duelDistanceKm > 0 ? currentBoardDistanceKm / duelDistanceKm : 0,
          isCurrentUser: true,
          liveStatus: currentUserDuelLiveStatus ?? undefined,
        },
        {
          id: effectiveDuelOpponent.id,
          name: effectiveDuelOpponent.name,
          distanceKm: opponentBoardDistanceKm,
          remainingKm: Math.max(0, duelDistanceKm - opponentBoardDistanceKm),
          progress: duelDistanceKm > 0 ? opponentBoardDistanceKm / duelDistanceKm : 0,
          isCurrentUser: false,
          liveStatus: effectiveDuelOpponent.liveStatus,
        },
      ]),
    };
  }

  if (matchMode === 'duel' && roomLinkedDuelPlaceholderParticipants.length === 2) {
    const placeholderDistanceKm = visibleMatchRoom?.linkedMatchDistanceKm ?? visibleMatchRoom?.distanceKm ?? duelDistanceKm;

    return {
      title: '1대1 레이스 보드',
      subtitle: '대결 정보를 맞추는 중에도 내 측정 거리와 상대 대기 상태를 볼 수 있어요.',
      rows: sortRaceRows(roomLinkedDuelPlaceholderParticipants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        distanceKm: participant.distanceKm,
        remainingKm: Math.max(0, placeholderDistanceKm - participant.distanceKm),
        progress: placeholderDistanceKm > 0 ? participant.distanceKm / placeholderDistanceKm : 0,
        isCurrentUser: participant.isCurrentUser,
        liveStatus: participant.liveStatus,
      }))),
    };
  }

  if (matchMode === 'group' && groupLiveStandings.length > 0) {
    return {
      title: '그룹 레이스 보드',
      subtitle: '전체 순위 흐름과 각 러너의 남은 거리를 계속 확인할 수 있어요.',
      rows: groupLiveStandings.map((participant) => ({
        id: participant.id,
        rank: participant.rank,
        name: participant.name,
        paceLabel: participant.isCurrentUser
          ? currentUserArenaPace
          : buildParticipantAveragePaceLabel(participant, groupArenaUsesLivePace),
        distanceKm: participant.currentDistanceKm,
        remainingKm: Math.max(0, groupDistanceKm - participant.currentDistanceKm),
        progress: groupDistanceKm > 0 ? participant.currentDistanceKm / groupDistanceKm : 0,
        isCurrentUser: participant.isCurrentUser,
        liveStatus: participant.liveStatus,
      })),
    };
  }

  if (matchMode === 'group' && roomLinkedGroupPlaceholderParticipants.length > 0) {
    const placeholderDistanceKm = visibleMatchRoom?.linkedMatchDistanceKm ?? visibleMatchRoom?.distanceKm ?? groupDistanceKm;

    return {
      title: '그룹 레이스 보드',
      subtitle: '그룹 대결 정보를 맞추는 중에도 참가자 목록과 내 진행 거리를 볼 수 있어요.',
      rows: sortRaceRows(roomLinkedGroupPlaceholderParticipants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        distanceKm: participant.distanceKm,
        remainingKm: Math.max(0, placeholderDistanceKm - participant.distanceKm),
        progress: placeholderDistanceKm > 0 ? participant.distanceKm / placeholderDistanceKm : 0,
        isCurrentUser: participant.isCurrentUser,
        liveStatus: participant.liveStatus,
      }))),
    };
  }

  if (matchMode === 'duel') {
    return {
      title: '1대1 레이스 보드',
      subtitle: '대결 기록을 맞추는 중이에요. 내 기록은 계속 측정되고 있어요.',
      rows: [
        {
          id: 'current-user-fallback',
          rank: 1,
          name: '나',
          distanceKm,
          remainingKm: Math.max(0, duelDistanceKm - distanceKm),
          progress: duelDistanceKm > 0 ? distanceKm / duelDistanceKm : 0,
          isCurrentUser: true,
          liveStatus: currentUserDuelLiveStatus ?? undefined,
        },
      ],
    };
  }

  if (matchMode === 'group') {
    return {
      title: '그룹 레이스 보드',
      subtitle: '그룹 기록을 맞추는 중이에요. 내 기록은 계속 측정되고 있어요.',
      rows: [
        {
          id: 'current-user-fallback',
          rank: 1,
          name: '나',
          distanceKm,
          remainingKm: Math.max(0, groupDistanceKm - distanceKm),
          progress: groupDistanceKm > 0 ? distanceKm / groupDistanceKm : 0,
          isCurrentUser: true,
          liveStatus: currentUserGroupLiveStatus ?? undefined,
        },
      ],
    };
  }

  return null;
}
