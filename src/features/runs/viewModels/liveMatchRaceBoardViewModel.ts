import type { LiveMatchRaceBoardRow } from '@/components/matches/LiveMatchRaceBoard';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  buildMatchProgressModel,
  buildParticipantAveragePaceLabel,
  resolveParticipantDisplayDistanceKm,
  type GroupLiveStanding,
} from '@/features/runs/viewModels/matchProgress';
import type { ArenaParticipantViewModel } from '@/features/runs/viewModels/matchViewModels';
import type { DuelMatchOpponent, RunningMatchRoom, RunningMatchRoomParticipant } from '@/lib/api/types';
import { rgPerfMark } from '@/utils/rgPerfTrace';

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

type DuelParticipantRaceBoardSeed = {
  id: string;
  isCurrentUser: boolean;
  name: string;
  participant: RunningMatchRoomParticipant;
};

type DuelParticipantProgressMergeResult = {
  missingProgress: boolean;
  opponentFallback: boolean;
  row: RaceBoardSourceRow;
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

function traceRaceBoardRows({
  matchMode,
  rows,
  source,
}: {
  matchMode: RunMatchMode;
  rows: LiveMatchRaceBoardRow[];
  source: string;
}) {
  const selfRows = rows.filter((row) => row.isCurrentUser).length;
  const opponentRows = rows.length - selfRows;

  rgPerfMark('live match race board rows built', {
    matchMode,
    opponentRows,
    rowCount: rows.length,
    selfRows,
    source,
  });
  rgPerfMark('live match race board self/opponent rows', {
    matchMode,
    opponentRows,
    rowCount: rows.length,
    selfRows,
    source,
  });
}

function resolveCurrentRoomParticipantUserId(room: RunningMatchRoom) {
  if (room.isHost) {
    return room.hostUserId;
  }

  if (room.mode === 'duel' && room.participants.length === 2) {
    return room.participants.find((participant) => participant.userId !== room.hostUserId)?.userId
      ?? room.participants[0]?.userId
      ?? null;
  }

  return null;
}

function resolveDuelParticipantDisplayName({
  effectiveDuelOpponent,
  isCurrentUser,
  participant,
}: {
  effectiveDuelOpponent: DuelMatchOpponent | null;
  isCurrentUser: boolean;
  participant: RunningMatchRoomParticipant;
}) {
  if (isCurrentUser) {
    return '나';
  }

  return participant.name.trim()
    || effectiveDuelOpponent?.name.trim()
    || participant.tag
    || effectiveDuelOpponent?.tag
    || '상대';
}

function buildDuelParticipantRaceBoardSeeds({
  effectiveDuelOpponent,
  room,
}: {
  effectiveDuelOpponent: DuelMatchOpponent | null;
  room: RunningMatchRoom;
}): DuelParticipantRaceBoardSeed[] {
  const currentUserId = resolveCurrentRoomParticipantUserId(room);

  return room.participants.slice(0, 2).map((participant, index) => {
    const isCurrentUser = currentUserId
      ? participant.userId === currentUserId
      : index === 0;

    return {
      id: participant.userId || `duel-room-participant-${index + 1}`,
      isCurrentUser,
      name: resolveDuelParticipantDisplayName({
        effectiveDuelOpponent,
        isCurrentUser,
        participant,
      }),
      participant,
    };
  });
}

function mergeDuelParticipantProgress({
  currentBoardDistanceKm,
  currentUserDuelLiveStatus,
  effectiveDuelOpponent,
  effectiveOpponentDistanceKm,
  seed,
  targetDistanceKm,
}: {
  currentBoardDistanceKm: number;
  currentUserDuelLiveStatus: DuelMatchOpponent['liveStatus'] | null;
  effectiveDuelOpponent: DuelMatchOpponent | null;
  effectiveOpponentDistanceKm: number;
  seed: DuelParticipantRaceBoardSeed;
  targetDistanceKm: number;
}): DuelParticipantProgressMergeResult {
  const progressModel = buildMatchProgressModel(seed.participant, targetDistanceKm);
  const displayProgress = progressModel.displayProgress;
  const participantProgressDistanceKm = displayProgress.distanceKm;
  const participantDistanceKm = seed.isCurrentUser
    ? Math.max(currentBoardDistanceKm, participantProgressDistanceKm)
    : Math.max(effectiveOpponentDistanceKm, participantProgressDistanceKm);

  return {
    missingProgress: !displayProgress.hasProgress,
    opponentFallback: !seed.isCurrentUser && participantDistanceKm <= 0,
    row: {
      id: seed.id,
      name: seed.name,
      distanceKm: participantDistanceKm,
      remainingKm: Math.max(0, targetDistanceKm - participantDistanceKm),
      progress: targetDistanceKm > 0 ? participantDistanceKm / targetDistanceKm : 0,
      isCurrentUser: seed.isCurrentUser,
      liveStatus: seed.isCurrentUser
        ? currentUserDuelLiveStatus ?? seed.participant.liveStatus
        : effectiveDuelOpponent?.liveStatus ?? seed.participant.liveStatus,
    },
  };
}

function buildDuelParticipantFirstRows({
  currentUserDuelLiveStatus,
  distanceKm,
  duelLiveGapKm,
  effectiveDuelOpponent,
  room,
  syncedDuelDistanceKm,
  syncedDuelOpponentDistanceKm,
  targetDistanceKm,
}: {
  currentUserDuelLiveStatus: DuelMatchOpponent['liveStatus'] | null;
  distanceKm: number;
  duelLiveGapKm: number | null;
  effectiveDuelOpponent: DuelMatchOpponent | null;
  room: RunningMatchRoom;
  syncedDuelDistanceKm: number;
  syncedDuelOpponentDistanceKm: number;
  targetDistanceKm: number;
}): LiveMatchRaceBoardRow[] {
  const currentBoardDistanceKm = duelLiveGapKm === null ? distanceKm : syncedDuelDistanceKm;
  const effectiveOpponentDistanceKm = effectiveDuelOpponent
    ? (duelLiveGapKm === null
      ? resolveParticipantDisplayDistanceKm(effectiveDuelOpponent, targetDistanceKm)
      : syncedDuelOpponentDistanceKm)
    : 0;
  let missingProgressCount = 0;
  let opponentFallbackCount = 0;
  const seedRows = buildDuelParticipantRaceBoardSeeds({
    effectiveDuelOpponent,
    room,
  });
  const rows = sortRaceRows(seedRows.map((seed) => {
    const mergeResult = mergeDuelParticipantProgress({
      currentBoardDistanceKm,
      currentUserDuelLiveStatus,
      effectiveDuelOpponent,
      effectiveOpponentDistanceKm,
      seed,
      targetDistanceKm,
    });

    if (mergeResult.missingProgress) {
      missingProgressCount += 1;
    }
    if (mergeResult.opponentFallback) {
      opponentFallbackCount += 1;
    }

    return mergeResult.row;
  }));

  if (missingProgressCount > 0) {
    rgPerfMark('live match race board progress missing', {
      matchMode: 'duel',
      missingProgressCount,
      roomId: room.roomId,
      source: 'participant-first rows',
    });
    rgPerfMark('live match progress participant missing', {
      matchMode: 'duel',
      missingProgressCount,
      roomId: room.roomId,
      source: 'participant-first rows',
    });
  }

  if (opponentFallbackCount > 0) {
    rgPerfMark('live match race board opponent row fallback', {
      matchMode: 'duel',
      opponentRows: opponentFallbackCount,
      roomId: room.roomId,
      rowCount: rows.length,
      source: 'participant-first rows',
    });
  }

  return rows;
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
  rgPerfMark('live match race board participant count', {
    hasDuelOpponent: Boolean(effectiveDuelOpponent),
    matchMode,
    roomParticipantCount: visibleMatchRoom?.participants.length ?? 0,
    roomPlaceholderCount: roomLinkedDuelPlaceholderParticipants.length,
  });

  if (matchMode === 'duel' && visibleMatchRoom?.mode === 'duel' && visibleMatchRoom.participants.length >= 2) {
    const placeholderDistanceKm = visibleMatchRoom.linkedMatchDistanceKm ?? visibleMatchRoom.distanceKm ?? duelDistanceKm;
    const rows = buildDuelParticipantFirstRows({
      currentUserDuelLiveStatus,
      distanceKm,
      duelLiveGapKm,
      effectiveDuelOpponent,
      room: visibleMatchRoom,
      syncedDuelDistanceKm,
      syncedDuelOpponentDistanceKm,
      targetDistanceKm: placeholderDistanceKm,
    });
    traceRaceBoardRows({ matchMode, rows, source: 'visible room participant-first' });

    return {
      title: '1대1 레이스 보드',
      subtitle: effectiveDuelOpponent
        ? '누가 더 앞서 있는지, 각각 얼마 남았는지 한눈에 볼 수 있어요.'
        : '대결 정보를 맞추는 중에도 같은 방의 상대를 함께 표시해요.',
      rows,
    };
  }

  if (matchMode === 'duel' && effectiveDuelOpponent) {
    const currentBoardDistanceKm = duelLiveGapKm === null ? distanceKm : syncedDuelDistanceKm;
    const opponentBoardDistanceKm = duelLiveGapKm === null
      ? resolveParticipantDisplayDistanceKm(effectiveDuelOpponent, duelDistanceKm)
      : syncedDuelOpponentDistanceKm;
    const rows = sortRaceRows([
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
        name: effectiveDuelOpponent.name || effectiveDuelOpponent.tag || '상대',
        distanceKm: opponentBoardDistanceKm,
        remainingKm: Math.max(0, duelDistanceKm - opponentBoardDistanceKm),
        progress: duelDistanceKm > 0 ? opponentBoardDistanceKm / duelDistanceKm : 0,
        isCurrentUser: false,
        liveStatus: effectiveDuelOpponent.liveStatus,
      },
    ]);
    traceRaceBoardRows({ matchMode, rows, source: 'duel opponent progress' });

    return {
      title: '1대1 레이스 보드',
      subtitle: '누가 더 앞서 있는지, 각각 얼마 남았는지 한눈에 볼 수 있어요.',
      rows,
    };
  }

  if (matchMode === 'duel' && roomLinkedDuelPlaceholderParticipants.length === 2) {
    const placeholderDistanceKm = visibleMatchRoom?.linkedMatchDistanceKm ?? visibleMatchRoom?.distanceKm ?? duelDistanceKm;
    const rows = sortRaceRows(roomLinkedDuelPlaceholderParticipants.map((participant) => ({
      id: participant.id,
      name: participant.name || '상대',
      distanceKm: participant.distanceKm,
      remainingKm: Math.max(0, placeholderDistanceKm - participant.distanceKm),
      progress: placeholderDistanceKm > 0 ? participant.distanceKm / placeholderDistanceKm : 0,
      isCurrentUser: participant.isCurrentUser,
      liveStatus: participant.liveStatus,
    })));
    traceRaceBoardRows({ matchMode, rows, source: 'room linked duel placeholder' });

    return {
      title: '1대1 레이스 보드',
      subtitle: '대결 정보를 맞추는 중에도 내 측정 거리와 상대 대기 상태를 볼 수 있어요.',
      rows,
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
