import type { RunningMatchRoom } from '@/lib/api/types';

// While a match is linked but the arena handoff is not yet confirmed (room/linked match
// state is still pre-'active'), poll at a slower cadence rather than stopping outright.
// Stopping the instant linkedMatchId is set meant a guest could miss a host cancel or the
// active transition that lands between handoff and arena mount.
export const LINKED_MATCH_PENDING_HANDOFF_POLL_MS = 3_000;

// Pure decision helper — deliberately free of any react-native dependency so it is unit
// testable. The waiting-room (no linked match) interval is injected by the caller, which
// resolves it from the platform via getFocusedInviteInboxPollMs().
export function resolveMatchRoomSnapshotPollingDecision({
  linkedMatchId,
  state,
  linkedMatchStatus,
  waitingRoomPollMs,
}: {
  linkedMatchId?: string | null;
  state?: RunningMatchRoom['state'] | null;
  linkedMatchStatus?: RunningMatchRoom['linkedMatchStatus'] | null;
  waitingRoomPollMs: number;
}) {
  if (linkedMatchId) {
    // The arena handoff is confirmed only once the room (or its linked match) reaches the
    // 'active' state — that is the 'arenaHandoff'/'active' phase the guest is waiting on.
    // Until then keep polling at a reduced cadence so a host cancel or the matched→active
    // transition is not missed in the window between linkedMatchId landing and arena mount.
    const handoffConfirmed = state === 'active' || linkedMatchStatus === 'active';

    if (!handoffConfirmed) {
      return {
        enabled: true,
        intervalMs: LINKED_MATCH_PENDING_HANDOFF_POLL_MS,
        owner: 'match-room snapshot',
        reason: `${state ?? 'linked'}-pending-arena-handoff`,
      };
    }

    return {
      enabled: false,
      intervalMs: 5000,
      owner: 'linked match status',
      reason: `${state ?? 'linked'}-live-match-handoff`,
    };
  }

  return {
    enabled: true,
    intervalMs: waitingRoomPollMs,
    owner: 'match-room snapshot',
    reason: 'waiting-room-sync',
  };
}
