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
  // HEAD-TO-HEAD FAIRNESS: the checkpoint-basis distance (currentBoardDistanceKm /
  // effectiveOpponentDistanceKm — both server-fed comparison values from the caller) is
  // AUTHORITATIVE for each side. We only fall back to the room participant's own live
  // display distance when the checkpoint value is missing (<= 0), so a side never shows a
  // fake 0.00 pre-sync. We intentionally do NOT Math.max the checkpoint value up toward the
  // per-participant LIVE progress — doing so would let one side's live GPS out-climb the
  // other's checkpoint value and reintroduce the very asymmetry this checkpoint basis removes.
  const checkpointBasisDistanceKm = seed.isCurrentUser
    ? currentBoardDistanceKm
    : effectiveOpponentDistanceKm;
  const participantDistanceKm = checkpointBasisDistanceKm > 0
    ? checkpointBasisDistanceKm
    : participantProgressDistanceKm;

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
  effectiveDuelOpponent: DuelMatchOpponent | null;
  opponentDuelResultLabel?: DuelResultLabel | null;
  room: RunningMatchRoom;
  syncedDuelDistanceKm: number;
  syncedDuelOpponentDistanceKm: number;
  targetDistanceKm: number;
}): ProgressiveSortedRaceBoardRowsResult {
  // Party-run (room-linked) duel — HEAD-TO-HEAD FAIRNESS mirrors the matched-duel path:
  // both sides sit on the SAME latest-common-checkpoint basis served by the backend. MY row
  // uses syncedDuelDistanceKm and the OPPONENT row uses syncedDuelOpponentDistanceKm, both
  // the server-fed comparison values at one identical checkpoint time. This supersedes the
  // earlier "live-both-sides" workaround (only needed under the coarse 30s step); the backend
  // now buckets at 10s and both sides are symmetric, so the gap can no longer inflate-snap.
  //
  // Anti-0.00 guard preserved: syncedDuelDistanceKm falls back to my live `distanceKm` when no
  // comparison snapshot exists yet; the opponent value falls back to the opponent's live
  // display distance (resolveParticipantDisplayDistanceKm) if the synced value is missing
  // (<= 0). The per-participant Math.max in mergeDuelParticipantProgress only ever raises a
  // row toward its own room-participant progress, so it can't cross-contaminate the sides.
  // Result/LP are server-determined (resultLabel), so this display change is duel-fair.
  const currentBoardDistanceKm = syncedDuelDistanceKm > 0
    ? syncedDuelDistanceKm
    : distanceKm;
  const liveOpponentDistanceKm = effectiveDuelOpponent
    ? resolveParticipantDisplayDistanceKm(effectiveDuelOpponent, targetDistanceKm)
    : 0;
  const effectiveOpponentDistanceKm = effectiveDuelOpponent
    ? (syncedDuelOpponentDistanceKm > 0
      ? syncedDuelOpponentDistanceKm
      : liveOpponentDistanceKm)
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
