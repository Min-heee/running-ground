// Module-level tombstone for match IDs whose run has already finished/forfeited and been
// saved (or otherwise terminated) on this device.
//
// Why this exists: the reservation-room / room-start handoff writes `forceMatchArena=1` +
// `focusMatchId` onto the persistent `/(tabs)/running` tab route, and nothing clears those
// params after the match ends. So when the user returns to the running tab AFTER the match
// is done, the route still says "force the live arena". The in-component
// `shouldSuppressDoneMatchAutoOpen` guard cannot catch this case because it is derived from
// the live duel/group statuses, and the post-run runtime reset clears those statuses to
// null — flipping the guard back off and letting the stale route re-open the live measuring
// shell instead of the clean ready/idle setup view.
//
// This tombstone is set by the post-run runtime reset (resetMatchRuntimeAfterTrackingCleared)
// and is consulted by the route-forced-arena gate. It is keyed to the specific ended matchId,
// so it ONLY suppresses the stale route force for a genuinely-done match and never blocks a
// new match, the reservation handoff pre-mount, or an in-progress race.

const TERMINATED_ROUTE_FOCUS_TTL_MS = 10 * 60 * 1000;

const terminatedRouteFocusMatchIds = new Map<string, number>();

function cleanupExpired(nowMs: number) {
  terminatedRouteFocusMatchIds.forEach((expiresAtMs, matchId) => {
    if (expiresAtMs <= nowMs) {
      terminatedRouteFocusMatchIds.delete(matchId);
    }
  });
}

export function markRouteFocusMatchTerminated(matchId: string | null | undefined, nowMs = Date.now()) {
  if (!matchId) {
    return;
  }

  cleanupExpired(nowMs);
  terminatedRouteFocusMatchIds.set(matchId, nowMs + TERMINATED_ROUTE_FOCUS_TTL_MS);
}

export function isRouteFocusMatchTerminated(matchId: string | null | undefined, nowMs = Date.now()): boolean {
  if (!matchId) {
    return false;
  }

  const expiresAtMs = terminatedRouteFocusMatchIds.get(matchId);
  if (expiresAtMs === undefined) {
    return false;
  }

  if (expiresAtMs <= nowMs) {
    terminatedRouteFocusMatchIds.delete(matchId);
    return false;
  }

  return true;
}

export function clearRouteFocusMatchTerminated(matchId?: string | null) {
  if (!matchId) {
    terminatedRouteFocusMatchIds.clear();
    return;
  }

  terminatedRouteFocusMatchIds.delete(matchId);
}

export function resetTerminatedRouteFocusMatchesForTest() {
  terminatedRouteFocusMatchIds.clear();
}
