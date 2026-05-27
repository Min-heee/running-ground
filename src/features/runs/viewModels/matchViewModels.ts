import type {
  DuelMatchOpponent,
  GroupMatchParticipant,
  RunningMatchRoom,
  RunningMatchRoomParticipant,
} from '@/lib/api/types';
import {
  buildMatchProgressModel,
  buildParticipantAveragePaceLabel,
  type GroupLiveStanding,
} from '@/features/runs/viewModels/matchProgress';
import {
  getCurrentUserResultLabel,
  getParticipantArenaLabel,
  type DuelResultLabel,
} from '@/features/runs/viewModels/matchResultProgressive';

type MatchLiveStatus = NonNullable<DuelMatchOpponent['liveStatus']>;

export type ArenaParticipantViewModel = {
  id: string;
  name: string;
  paceLabel: string;
  distanceKm: number;
  rankLabel?: string;
  resultLabel?: DuelResultLabel | null;
  finishedAt?: string | null;
  isCurrentUser?: boolean;
  isLeader?: boolean;
  liveStatus?: MatchLiveStatus;
  showPaceBubble?: boolean;
  emphasis?: 'featured' | 'compact';
};

type RoomLinkedMatchState = {
  state: 'matched' | 'active';
} | null;

function isSameRemoteParticipant(
  left: Pick<DuelMatchOpponent, 'id' | 'tag'> | Pick<GroupMatchParticipant, 'id' | 'tag'> | null | undefined,
  right: Pick<RunningMatchRoomParticipant, 'userId' | 'tag'>,
) {
  if (!left) {
    return false;
  }

  return left.id === right.userId
    || left.tag === right.tag
    || left.tag === right.userId;
}

function mergeRoomParticipantProgress<T extends DuelMatchOpponent | GroupMatchParticipant>(
  roomParticipant: RunningMatchRoomParticipant,
  statusParticipant: T | null,
) {
  if (!statusParticipant) {
    return roomParticipant;
  }

  return {
    ...roomParticipant,
    liveDistanceKm: statusParticipant.liveDistanceKm ?? roomParticipant.liveDistanceKm,
    liveElapsedSeconds: statusParticipant.liveElapsedSeconds ?? roomParticipant.liveElapsedSeconds,
    livePace: statusParticipant.livePace ?? roomParticipant.livePace,
    liveUpdatedAt: statusParticipant.liveUpdatedAt ?? roomParticipant.liveUpdatedAt,
    officialAveragePace: statusParticipant.officialAveragePace ?? roomParticipant.officialAveragePace,
    officialReady: statusParticipant.officialReady ?? roomParticipant.officialReady,
    officialDistanceKm: statusParticipant.officialDistanceKm ?? roomParticipant.officialDistanceKm,
    officialElapsedSeconds: statusParticipant.officialElapsedSeconds ?? roomParticipant.officialElapsedSeconds,
    officialRank: statusParticipant.officialRank ?? roomParticipant.officialRank,
    officialGapAheadKm: statusParticipant.officialGapAheadKm ?? roomParticipant.officialGapAheadKm,
    officialGapLeaderKm: statusParticipant.officialGapLeaderKm ?? roomParticipant.officialGapLeaderKm,
    officialComparedAt: statusParticipant.officialComparedAt ?? roomParticipant.officialComparedAt,
    liveStatus: statusParticipant.liveStatus ?? roomParticipant.liveStatus,
    finishedAt: statusParticipant.finishedAt ?? roomParticipant.finishedAt,
  };
}

function decorateDuelResultLabels(participants: ArenaParticipantViewModel[]) {
  const currentUser = participants.find((participant) => participant.isCurrentUser) ?? null;
  const opponentParticipant = participants.find((participant) => !participant.isCurrentUser) ?? null;
  const currentUserResultLabel = getCurrentUserResultLabel(currentUser, opponentParticipant, 'duel');
  const currentUserFinishedAt = currentUser?.finishedAt ?? null;

  return participants.map((participant) => {
    const arenaLabel = getParticipantArenaLabel(
      participant,
      'duel',
      currentUserFinishedAt,
      currentUserResultLabel,
    );

    return {
      ...participant,
      resultLabel: arenaLabel?.kind === 'result' ? arenaLabel.text as DuelResultLabel : null,
    };
  });
}

export function buildDuelArenaParticipants({
  currentUserPaceLabel,
  currentUserLiveStatus,
  currentUserFinishedAt = null,
  currentDistanceKm,
  opponent,
  opponentPaceLabel,
  opponentDistanceKm,
  liveGapKm,
}: {
  currentUserPaceLabel: string;
  currentUserLiveStatus?: MatchLiveStatus;
  currentUserFinishedAt?: string | null;
  currentDistanceKm: number;
  opponent: DuelMatchOpponent | null;
  opponentPaceLabel: string;
  opponentDistanceKm: number;
  liveGapKm: number | null;
}): ArenaParticipantViewModel[] {
  if (!opponent) {
    return [];
  }

  const opponentForfeited = opponent.liveStatus === 'forfeited';
  return decorateDuelResultLabels([
    {
      id: 'me',
      name: '나',
      paceLabel: currentUserPaceLabel,
      distanceKm: currentDistanceKm,
      finishedAt: currentUserFinishedAt,
      isCurrentUser: true,
      isLeader: liveGapKm !== null ? liveGapKm >= 0 : false,
      liveStatus: currentUserLiveStatus,
      showPaceBubble: Boolean(currentUserPaceLabel),
    },
    {
      id: opponent.id,
      name: opponent.name,
      paceLabel: opponentForfeited ? '기권' : opponentPaceLabel,
      distanceKm: opponentDistanceKm,
      finishedAt: opponent.finishedAt ?? null,
      isLeader: liveGapKm !== null ? liveGapKm < 0 : true,
      liveStatus: opponent.liveStatus,
      showPaceBubble: opponentForfeited || Boolean(opponentPaceLabel),
    },
  ]);
}

export function buildRoomLinkedDuelPlaceholderParticipants({
  room,
  hasRoomLinkedDuelContext,
  currentUserId,
  currentDistanceKm,
  currentUserPaceLabel,
  opponent,
  roomLinkedMatchContext,
}: {
  room: RunningMatchRoom | null;
  hasRoomLinkedDuelContext: boolean;
  currentUserId: string;
  currentDistanceKm: number;
  currentUserPaceLabel: string;
  opponent: DuelMatchOpponent | null;
  roomLinkedMatchContext: RoomLinkedMatchState;
}): ArenaParticipantViewModel[] {
  if (!hasRoomLinkedDuelContext || !room) {
    return [];
  }

  const placeholderDistanceKm = room.linkedMatchDistanceKm ?? room.distanceKm;
  const participants = room.participants.slice(0, 2).map((participant) => {
    const isCurrentUser = participant.userId === currentUserId || participant.tag === currentUserId;
    const statusParticipant = !isCurrentUser && isSameRemoteParticipant(opponent, participant)
      ? opponent
      : null;
    const mergedParticipant = mergeRoomParticipantProgress(participant, statusParticipant);
    const participantLiveStatus = mergedParticipant.liveStatus;
    const participantFinishedAt = mergedParticipant.finishedAt ?? null;
    const progressModel = buildMatchProgressModel(mergedParticipant, placeholderDistanceKm);
    const participantDistanceKm = isCurrentUser && roomLinkedMatchContext?.state === 'active'
      ? currentDistanceKm
      : progressModel.displayProgress.distanceKm;
    const participantPaceLabel = isCurrentUser
      ? currentUserPaceLabel
      : buildParticipantAveragePaceLabel(mergedParticipant, roomLinkedMatchContext?.state === 'active');

    return {
      id: participant.userId,
      name: isCurrentUser ? '나' : participant.name,
      paceLabel: participantLiveStatus === 'forfeited' ? '기권' : participantPaceLabel,
      distanceKm: participantDistanceKm,
      finishedAt: participantFinishedAt,
      isCurrentUser,
      isLeader: false,
      liveStatus: participantLiveStatus,
      showPaceBubble: participantLiveStatus === 'forfeited' || Boolean(participantPaceLabel),
    };
  });

  const leaderDistanceKm = Math.max(...participants.map((participant) => participant.distanceKm));
  const participantsWithLeader = participants.map((participant) => ({
    ...participant,
    isLeader: participant.distanceKm >= leaderDistanceKm && leaderDistanceKm > 0,
  }));

  return decorateDuelResultLabels(participantsWithLeader);
}

export function buildGroupArenaParticipants({
  standings,
  currentUserPaceLabel,
  hasOfficialStart,
  featuredParticipantIds,
}: {
  standings: GroupLiveStanding[];
  currentUserPaceLabel: string;
  hasOfficialStart: boolean;
  featuredParticipantIds: Set<string>;
}): ArenaParticipantViewModel[] {
  return standings.map((participant) => {
    const participantPaceLabel = participant.isCurrentUser
      ? currentUserPaceLabel
      : buildParticipantAveragePaceLabel(participant, hasOfficialStart);

    return {
      id: participant.id,
      name: participant.isCurrentUser ? '나' : participant.name,
      paceLabel: participantPaceLabel,
      distanceKm: participant.currentDistanceKm,
      rankLabel: String(participant.rank),
      finishedAt: participant.finishedAt ?? null,
      isCurrentUser: participant.isCurrentUser,
      isLeader: participant.rank === 1,
      liveStatus: participant.liveStatus,
      showPaceBubble: Boolean(participantPaceLabel),
      emphasis: featuredParticipantIds.has(participant.id) ? 'featured' : 'compact',
    };
  });
}

export function buildRoomLinkedGroupPlaceholderParticipants({
  room,
  hasRoomLinkedGroupContext,
  currentUserId,
  currentDistanceKm,
  currentUserPaceLabel,
  effectiveGroupParticipants,
  roomLinkedMatchContext,
}: {
  room: RunningMatchRoom | null;
  hasRoomLinkedGroupContext: boolean;
  currentUserId: string;
  currentDistanceKm: number;
  currentUserPaceLabel: string;
  effectiveGroupParticipants: GroupMatchParticipant[];
  roomLinkedMatchContext: RoomLinkedMatchState;
}): ArenaParticipantViewModel[] {
  if (!hasRoomLinkedGroupContext || !room) {
    return [];
  }

  return room.participants.map((participant, index) => {
    const isCurrentUser = participant.userId === currentUserId || participant.tag === currentUserId;
    const statusParticipant = effectiveGroupParticipants.find((groupParticipant) => (
      isSameRemoteParticipant(groupParticipant, participant)
    )) ?? null;
    const mergedParticipant = mergeRoomParticipantProgress(participant, statusParticipant);
    const participantLiveStatus = mergedParticipant.liveStatus;
    const participantFinishedAt = mergedParticipant.finishedAt ?? null;
    const placeholderDistanceKm = room.linkedMatchDistanceKm ?? room.distanceKm;
    const progressModel = buildMatchProgressModel(mergedParticipant, placeholderDistanceKm);
    const participantDistanceKm = isCurrentUser && roomLinkedMatchContext?.state === 'active'
      ? currentDistanceKm
      : progressModel.displayProgress.distanceKm;
    const participantPaceLabel = isCurrentUser
      ? currentUserPaceLabel
      : buildParticipantAveragePaceLabel(mergedParticipant, roomLinkedMatchContext?.state === 'active');

    return {
      id: participant.userId,
      name: isCurrentUser ? '나' : participant.name,
      paceLabel: participantLiveStatus === 'forfeited' ? '기권' : participantPaceLabel,
      distanceKm: participantDistanceKm,
      rankLabel: String(index + 1),
      finishedAt: participantFinishedAt,
      isCurrentUser,
      isLeader: index === 0,
      liveStatus: participantLiveStatus,
      showPaceBubble: participantLiveStatus === 'forfeited' || Boolean(participantPaceLabel),
      emphasis: 'featured' as const,
    };
  });
}
