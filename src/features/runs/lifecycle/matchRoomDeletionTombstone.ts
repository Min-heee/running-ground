import { rgPerfMark } from '@/utils/rgPerfTrace';

const DELETE_TOMBSTONE_TTL_MS = 10 * 60 * 1000;

const deletedRoomIds = new Map<string, number>();
const hostTransferredRoomIds = new Map<string, number>();
const deletedRoomListeners = new Set<(event: MatchRoomDeletedEvent) => void>();

type TombstoneRoomSnapshot = {
  hostUserId?: string | null;
  isHost?: boolean | null;
  roomId?: string | null;
};

export type MatchRoomDeletedEvent = {
  expiresAtMs: number;
  roomId: string;
  source: string;
};

function cleanupExpiredDeletedRooms(nowMs = Date.now()) {
  deletedRoomIds.forEach((expiresAtMs, roomId) => {
    if (expiresAtMs <= nowMs) {
      deletedRoomIds.delete(roomId);
    }
  });
  hostTransferredRoomIds.forEach((expiresAtMs, roomId) => {
    if (expiresAtMs <= nowMs) {
      hostTransferredRoomIds.delete(roomId);
    }
  });
}

function notifyMatchRoomDeleted(event: MatchRoomDeletedEvent) {
  deletedRoomListeners.forEach((listener) => {
    listener(event);
  });
}

export function markMatchRoomDeleted(roomId: string, source = 'match-room delete', nowMs = Date.now()) {
  cleanupExpiredDeletedRooms(nowMs);
  const expiresAtMs = nowMs + DELETE_TOMBSTONE_TTL_MS;
  deletedRoomIds.set(roomId, expiresAtMs);
  rgPerfMark('room delete tombstone added', {
    roomId,
    source,
  });
  notifyMatchRoomDeleted({
    expiresAtMs,
    roomId,
    source,
  });
}

export function clearMatchRoomDeletedTombstone(roomId: string | null | undefined, source = 'new room') {
  if (!roomId) {
    return;
  }

  hostTransferredRoomIds.delete(roomId);
  if (!deletedRoomIds.delete(roomId)) {
    return;
  }

  rgPerfMark('room delete tombstone cleared after new room', {
    roomId,
    source,
  });
}

export function isMatchRoomDeleted(roomId: string | null | undefined, nowMs = Date.now()) {
  if (!roomId) {
    return false;
  }

  cleanupExpiredDeletedRooms(nowMs);
  return deletedRoomIds.has(roomId);
}

export function findDeletedMatchRoomId(roomIds: (string | null | undefined)[], nowMs = Date.now()) {
  cleanupExpiredDeletedRooms(nowMs);
  return roomIds.find((roomId) => Boolean(roomId && deletedRoomIds.has(roomId))) ?? null;
}

export function subscribeMatchRoomDeletedTombstone(listener: (event: MatchRoomDeletedEvent) => void) {
  deletedRoomListeners.add(listener);
  return () => {
    deletedRoomListeners.delete(listener);
  };
}

export function hasMatchRoomHostTransferred({
  currentRoom,
  nextRoom,
}: {
  currentRoom: TombstoneRoomSnapshot | null | undefined;
  nextRoom: TombstoneRoomSnapshot | null | undefined;
}) {
  return Boolean(
    currentRoom?.roomId
    && nextRoom?.roomId
    && currentRoom.roomId === nextRoom.roomId
    && currentRoom.hostUserId
    && nextRoom.hostUserId
    && currentRoom.hostUserId !== nextRoom.hostUserId
  );
}

export function markMatchRoomHostTransferObserved({
  currentRoom,
  nextRoom,
  nowMs = Date.now(),
  source = 'match-room snapshot',
}: {
  currentRoom: TombstoneRoomSnapshot | null | undefined;
  nextRoom: TombstoneRoomSnapshot | null | undefined;
  nowMs?: number;
  source?: string;
}) {
  cleanupExpiredDeletedRooms(nowMs);
  if (!hasMatchRoomHostTransferred({ currentRoom, nextRoom }) || !nextRoom?.roomId) {
    return false;
  }

  hostTransferredRoomIds.set(nextRoom.roomId, nowMs + DELETE_TOMBSTONE_TTL_MS);
  rgPerfMark('room host transfer observed', {
    nextIsHost: nextRoom.isHost ?? null,
    roomId: nextRoom.roomId,
    source,
  });
  return true;
}

export function markMatchRoomDeletedFromMissingActiveRoom({
  nowMs = Date.now(),
  room,
  source = 'active room result',
}: {
  nowMs?: number;
  room: TombstoneRoomSnapshot | null | undefined;
  source?: string;
}) {
  cleanupExpiredDeletedRooms(nowMs);
  if (!room?.roomId) {
    return null;
  }

  const hostTransferObserved = hostTransferredRoomIds.has(room.roomId);
  markMatchRoomDeleted(room.roomId, source, nowMs);
  rgPerfMark('room delete tombstone propagated from missing active room', {
    hostTransferObserved,
    roomId: room.roomId,
    source,
    wasHost: room.isHost ?? null,
  });
  return room.roomId;
}

export function resetMatchRoomDeletionTombstonesForTest() {
  deletedRoomIds.clear();
  hostTransferredRoomIds.clear();
  deletedRoomListeners.clear();
}
