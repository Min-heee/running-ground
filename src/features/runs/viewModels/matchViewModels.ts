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
  progressPaceLabel?: string;
  distanceKm: number;
  elapsedSeconds?: number;
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
  const liveStatus = resolveMergedLiveStatus(roomParticipant.liveStatus, statusParticipant?.liveStatus);

  if (!statusParticipant) {
    return {
      ...roomParticipant,
      liveStatus,
    };
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
    liveStatus,
    finishedAt: statusParticipant.finishedAt ?? roomParticipant.finishedAt,
  };
}

function resolveMergedLiveStatus(
  roomStatus: MatchLiveStatus | undefined,
  statusStatus: MatchLiveStatus | undefined,
): MatchLiveStatus | undefined {
  if (roomStatus === 'forfeited' || statusStatus === 'forfeited') {
    return 'forfeited';
  }

  if (roomStatus === 'finished' || statusStatus === 'finished') {
    return 'finished';
  }

  return statusStatus ?? roomStatus;
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
      progressPaceLabel: participantPaceLabel,
      distanceKm: participantDistanceKm,
      elapsedSeconds: progressModel.displayProgress.elapsedSeconds,
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

  const placeholderParticipants = room.participants.map((participant, index) => {
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
      progressPaceLabel: participantPaceLabel,
      distanceKm: participantDistanceKm,
      elapsedSeconds: progressModel.displayProgress.elapsedSeconds,
      finishedAt: participantFinishedAt,
      isCurrentUser,
      isLeader: index === 0,
      liveStatus: participantLiveStatus,
      showPaceBubble: participantLiveStatus === 'forfeited' || Boolean(participantPaceLabel),
      emphasis: 'featured' as const,
    };
  });

  // rankLabel은 로스터 순서가 아니라 라이브 거리 순위로 붙인다 (적대 리뷰 2026-08-05):
  // 활성 구간에서 아레나가 거리로 재정렬한 줄 위에 로스터 고정 번호가 얹히면
  // 순위 열이 뒤죽박죽으로 보이고(2,1,3), 타워의 ▲▼ 상태머신도 이 라벨을 파싱하므로
  // 진짜 순위여야 표준 standings 도착 시 가짜 화살표 폭발이 없다. 배열 순서 자체는
  // 로스터 순서를 유지해 다른 소비처(레이스보드 정렬 입력 등)에 영향을 주지 않는다.
  const rankOrdered = [...placeholderParticipants].sort((left, right) => {
    const leftForfeited = left.liveStatus === 'forfeited';
    const rightForfeited = right.liveStatus === 'forfeited';
    if (leftForfeited !== rightForfeited) {
      return leftForfeited ? 1 : -1;
    }
    return right.distanceKm - left.distanceKm;
  });
  const rankByParticipantId = new Map(rankOrdered.map((participant, rankIndex) => [participant.id, rankIndex + 1]));

  return placeholderParticipants.map((participant) => ({
    ...participant,
    rankLabel: String(rankByParticipantId.get(participant.id)),
  }));
}
