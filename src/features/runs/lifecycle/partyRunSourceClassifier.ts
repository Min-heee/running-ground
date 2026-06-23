import type { RoomLinkedMatchContext } from '@/features/runs/lifecycle/matchExitFlow';
import type { RunMatchSource } from '@/domain';

// Durable party-vs-official classification for a saved/forfeited run.
//
// `roomLinkedMatchContext` is EPHEMERAL: it is re-derived every render from the live
// match room (selectPartyRunRuntimeSource), and it is only truthy while the linked room
// still sits in a qualifying state (arming/countdown/active + joined). An early forfeit
// tears the room down (markForfeited → leaveRunningMatch → reset) BEFORE the save reads
// it, so a real party run could momentarily look non-party and get saved as 'official' —
// which then leaks the ranked label + an estimated rank LP pill onto a party record.
//
// `wasPartyRun` is the LATCH: once the run is known to have come from a party room it stays
// true for the rest of that run, surviving the ephemeral falsy window. It is reset to false
// on every post-run runtime reset, so the next matchmaking/official run starts clean.
//
// We treat the run as party when EITHER signal says party. An official matchmaking match can
// never set either signal: it never populates a RunningMatchRoom, so roomLinkedMatchContext
// stays null and the latch never flips — official matches stay 'official'.
export function isPartyRunForSave({
  wasPartyRun,
  roomLinkedMatchContext,
}: {
  wasPartyRun: boolean;
  roomLinkedMatchContext: RoomLinkedMatchContext;
}): boolean {
  return wasPartyRun || Boolean(roomLinkedMatchContext);
}

export function resolveMatchSaveSource(input: {
  wasPartyRun: boolean;
  roomLinkedMatchContext: RoomLinkedMatchContext;
}): RunMatchSource {
  return isPartyRunForSave(input) ? 'party' : 'official';
}
