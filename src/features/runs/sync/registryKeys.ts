export function buildActiveRoomRegistryKey(userIdOrScope: string, source?: string) {
  // Runtime registry key policy: active-room:<userId/source>
  return source ? `active-room:${userIdOrScope}/${source}` : `active-room:${userIdOrScope}`;
}

export function buildBlockingMatchStatusRegistryKey(matchId: string) {
  // Runtime registry key policy: blocking-match-status:<matchId>
  return `blocking-match-status:${matchId}`;
}

export function buildWaitingMatchDiscoveryRegistryKey(mode: 'duel' | 'group', slotStartAt: string) {
  // A queued runner waiting for an opponent has no matchId yet, so the discovery poll
  // is keyed by mode + slot. Runtime registry key policy: waiting-match-discovery:<mode>:<slot>
  return `waiting-match-discovery:${mode}:${slotStartAt}`;
}

export function buildMatchProgressRegistryKey(matchId: string) {
  // Runtime registry key policy: match-progress:<matchId>
  return `match-progress:${matchId}`;
}
