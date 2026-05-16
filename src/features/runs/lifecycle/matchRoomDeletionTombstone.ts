import { rgPerfMark } from '@/utils/rgPerfTrace';

const DELETE_TOMBSTONE_TTL_MS = 10 * 60 * 1000;

const deletedRoomIds = new Map<string, number>();

function cleanupExpiredDeletedRooms(nowMs = Date.now()) {
  deletedRoomIds.forEach((expiresAtMs, roomId) => {
    if (expiresAtMs <= nowMs) {
      deletedRoomIds.delete(roomId);
    }
  });
}

export function markMatchRoomDeleted(roomId: string, source = 'match-room delete', nowMs = Date.now()) {
  cleanupExpiredDeletedRooms(nowMs);
  deletedRoomIds.set(roomId, nowMs + DELETE_TOMBSTONE_TTL_MS);
  rgPerfMark('room delete tombstone added', {
    roomId,
    source,
  });
}

export function clearMatchRoomDeletedTombstone(roomId: string | null | undefined, source = 'new room') {
  if (!roomId) {
    return;
  }

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

export function resetMatchRoomDeletionTombstonesForTest() {
  deletedRoomIds.clear();
}
