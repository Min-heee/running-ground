import type { RunningMatchRoom } from '@/lib/api/types';

export type ActiveRoomResultSkipReason =
  | 'same room snapshot'
  | 'stale result'
  | 'unmounted'
  | 'already navigating';

export function buildActiveRoomSnapshotKey({
  room,
  userId,
}: {
  room: RunningMatchRoom | null;
  userId: string;
}) {
  if (!room) {
    return `${userId}:no-active-room`;
  }

  const inviteKey = room.invitedFriends
    ?.map((friend) => [friend.userId, friend.status].join(':'))
    .sort()
    .join('|') ?? 'no-invites';
  const participantKey = room.participants
    .map((participant) => [
      participant.userId,
      participant.isHost ? 'host' : 'guest',
      participant.isReady ? 'ready' : 'waiting',
      participant.isCountdownReady ? 'countdown-ready' : 'countdown-waiting',
      participant.liveStatus ?? 'no-live-status',
      participant.finishedAt ?? 'no-finished',
      participant.officialReady ? 'official-ready' : 'official-waiting',
      participant.officialDistanceKm ?? 'no-official-distance',
      participant.officialElapsedSeconds ?? 'no-official-elapsed',
      participant.officialAveragePace ?? 'no-official-pace',
      participant.officialRank ?? 'no-official-rank',
    ].join(':'))
    .sort()
    .join('|');

  return [
    userId,
    room.roomId,
    room.hostUserId,
    room.isHost ? 'host' : 'guest',
    room.state,
    room.startMode,
    room.distanceKm,
    room.slotStartAt,
    room.maxParticipants,
    room.canStart ? 'can-start' : 'cannot-start',
    room.joined === false ? 'invited-only' : 'joined',
    room.linkedMatchId ?? 'no-match',
    room.linkedMatchStatus ?? 'no-match-status',
    room.linkedMatchSlotStartAt ?? 'no-linked-slot',
    inviteKey,
    participantKey,
  ].join('::');
}

export function buildActiveRoomResultLogDetail({
  room,
  snapshotKey,
  source,
  reason,
}: {
  reason?: ActiveRoomResultSkipReason;
  room: RunningMatchRoom | null;
  snapshotKey: string;
  source: string;
}) {
  return {
    linkedMatchId: room?.linkedMatchId ?? null,
    reason,
    roomId: room?.roomId ?? null,
    snapshotKey,
    source,
    state: room?.state ?? null,
  };
}
