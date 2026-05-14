const EXIT_GUARD_TTL_MS = 15_000;

const exitingRoomIds = new Map<string, number>();

function cleanupExpiredExitGuards(nowMs = Date.now()) {
  exitingRoomIds.forEach((expiresAtMs, roomId) => {
    if (expiresAtMs <= nowMs) {
      exitingRoomIds.delete(roomId);
    }
  });
}

export function markMatchRoomExiting(roomId: string, nowMs = Date.now()) {
  cleanupExpiredExitGuards(nowMs);
  exitingRoomIds.set(roomId, nowMs + EXIT_GUARD_TTL_MS);
}

export function clearMatchRoomExitGuard(roomId: string) {
  exitingRoomIds.delete(roomId);
}

export function isMatchRoomExiting(roomId: string | null | undefined, nowMs = Date.now()) {
  if (!roomId) {
    return false;
  }

  cleanupExpiredExitGuards(nowMs);
  return exitingRoomIds.has(roomId);
}
