export function buildActiveRoomRegistryKey(userIdOrScope: string, source?: string) {
  return source ? `active-room:${userIdOrScope}:${source}` : `active-room:${userIdOrScope}`;
}

export function buildBlockingMatchStatusRegistryKey(matchId: string) {
  return `blocking-match-status:${matchId}`;
}

export function buildMatchProgressRegistryKey(matchId: string) {
  return `match-progress:${matchId}`;
}
