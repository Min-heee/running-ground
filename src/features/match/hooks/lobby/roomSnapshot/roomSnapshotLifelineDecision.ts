// Room-snapshot lifeline — pure tick decision (docs/lobby-room-poll-latch-diag-2026-07-06.md,
// Piece 2; mirrors the opponent-sync lifeline from docs/opponent-poll-stall-diag-2026-07-06.md).
// The lifeline is a registry-free plain setInterval in the lobby: while the guest is waiting in
// the 대기실 (mounted, focused, polling not paused, NO linkedMatchId yet), a completed
// 'match-room snapshot' active-room check must have landed within the last 6s; if not, every
// lobby delivery channel (registry poller, foreground one-shot, runtime bridge) is provably
// silent and the lifeline forces one guarded loadRoom(). Covers BOTH failure modes: in latch
// mode (lost keyed-slot acquire → dead interval) the guest still learns host-start within
// ~staleness + one tick; in starvation mode it adds independent attempts. Downstream idempotence
// (700ms activeRoomCheck throttle, in-flight reuse, snapshot-key dedup, monotonic serverNow)
// makes redundant fires no-ops. Kept pure + RN-free so the fire/skip rule is unit testable under
// the plain node runner.
export const ROOM_SNAPSHOT_LIFELINE_INTERVAL_MS = 3_000;
export const ROOM_SNAPSHOT_LIFELINE_STALE_AFTER_MS = 6_000;

export function shouldForceRoomSnapshotLifelineLoad({
  focused,
  hasLinkedMatch,
  inFlight,
  lastCheckMs,
  mounted,
  nowMs,
  paused,
}: {
  focused: boolean;
  hasLinkedMatch: boolean;
  inFlight: boolean;
  lastCheckMs: number | null;
  mounted: boolean;
  nowMs: number;
  paused: boolean;
}): boolean {
  if (!mounted || !focused || paused) {
    // Unmounted/blurred/handed-off lobby: another surface owns /rooms/my delivery there.
    return false;
  }

  if (hasLinkedMatch) {
    // Once the guest knows the linked match, the lobby handoff + linked-match owners take over —
    // the lifeline goes silent.
    return false;
  }

  if (inFlight) {
    // A lifeline load is already out — never stack requests.
    return false;
  }

  if (lastCheckMs === null) {
    // No 'match-room snapshot' check has EVER completed — the normal poller is provably silent.
    return true;
  }

  return nowMs - lastCheckMs > ROOM_SNAPSHOT_LIFELINE_STALE_AFTER_MS;
}
