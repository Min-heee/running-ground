export function buildActiveRoomRegistryKey(userIdOrScope: string, source?: string) {
  // Runtime registry key policy: active-room:<userId/source>
  return source ? `active-room:${userIdOrScope}/${source}` : `active-room:${userIdOrScope}`;
}

export function buildBlockingMatchStatusRegistryKey(matchId: string) {
  // Runtime registry key policy: blocking-match-status:<matchId>
  return `blocking-match-status:${matchId}`;
}

export function buildMatchProgressRegistryKey(matchId: string) {
  // Runtime registry key policy: match-progress:<matchId>
  return `match-progress:${matchId}`;
}
