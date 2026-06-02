import {
  buildMatchProgressModel,
  resolveParticipantDisplayDistanceKm,
} from '@/features/runs/viewModels/matchProgress';
import type { DuelResultLabel } from '@/features/runs/types/matchResult';
import {
  sortProgressiveRaceRows,
  type ProgressiveSortedRaceBoardRowsResult,
  type RaceBoardSourceRow,
} from '@/features/runs/viewModels/liveMatchRaceBoardProgressive';
import type { DuelMatchOpponent, RunningMatchRoom, RunningMatchRoomParticipant } from '@/lib/api/types';
import { rgPerfMark } from '@/utils/rgPerfTrace';

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

function resolveMergedLiveStatus(
  roomStatus: DuelMatchOpponent['liveStatus'] | undefined,
  statusStatus: DuelMatchOpponent['liveStatus'] | null | undefined,
) {
  if (roomStatus === 'forfeited' || statusStatus === 'forfeited') {
    return 'forfeited';
  }

  if (roomStatus === 'finished' || statusStatus === 'finished') {
    return 'finished';
  }

  return statusStatus ?? roomStatus;
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
  currentUserDuelResultLabel,
  effectiveDuelOpponent,
  effectiveOpponentDistanceKm,
  opponentDuelResultLabel,
  seed,
  targetDistanceKm,
}: {
  currentBoardDistanceKm: number;
  currentUserDuelLiveStatus: DuelMatchOpponent['liveStatus'] | null;
  currentUserDuelResultLabel?: DuelResultLabel | null;
  effectiveDuelOpponent: DuelMatchOpponent | null;
  effectiveOpponentDistanceKm: number;
  opponentDuelResultLabel?: DuelResultLabel | null;
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
        ? resolveMergedLiveStatus(seed.participant.liveStatus, currentUserDuelLiveStatus)
        : resolveMergedLiveStatus(seed.participant.liveStatus, effectiveDuelOpponent?.liveStatus),
      resultLabel: seed.isCurrentUser
        ? currentUserDuelResultLabel ?? null
        : opponentDuelResultLabel ?? null,
    },
  };
}

export function buildDuelParticipantFirstRows({
  currentUserDuelLiveStatus,
  currentUserDuelResultLabel,
  distanceKm,
  duelLiveGapKm,
  effectiveDuelOpponent,
  opponentDuelResultLabel,
  room,
  syncedDuelDistanceKm,
  syncedDuelOpponentDistanceKm,
  targetDistanceKm,
}: {
  currentUserDuelLiveStatus: DuelMatchOpponent['liveStatus'] | null;
  currentUserDuelResultLabel?: DuelResultLabel | null;
  distanceKm: number;
  duelLiveGapKm: number | null;
  effectiveDuelOpponent: DuelMatchOpponent | null;
  opponentDuelResultLabel?: DuelResultLabel | null;
  room: RunningMatchRoom;
  syncedDuelDistanceKm: number;
  syncedDuelOpponentDistanceKm: number;
  targetDistanceKm: number;
}): ProgressiveSortedRaceBoardRowsResult {
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
  const progressiveRows = sortProgressiveRaceRows(seedRows.map((seed) => {
    const mergeResult = mergeDuelParticipantProgress({
      currentBoardDistanceKm,
      currentUserDuelLiveStatus,
      currentUserDuelResultLabel,
      effectiveDuelOpponent,
      effectiveOpponentDistanceKm,
      opponentDuelResultLabel,
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
  }), { hideRunningOthers: false });

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
      rowCount: progressiveRows.rows.length,
      source: 'participant-first rows',
    });
  }

  return progressiveRows;
}
