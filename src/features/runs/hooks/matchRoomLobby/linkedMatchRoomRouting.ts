import type { RunningMatchRoom } from '@/lib/api/types';
import type { PartyRunFlowSnapshot } from '@/features/runs/lifecycle/matchStateMachine';

export function hasRoomLinkedMatchSlotStarted(room: RunningMatchRoom, syncedNowMs: number) {
  if (!room.linkedMatchId) {
    return false;
  }

  const linkedSlotStartAt = room.linkedMatchSlotStartAt ?? room.slotStartAt;
  const linkedSlotStartMs = Date.parse(linkedSlotStartAt);

  return Number.isFinite(linkedSlotStartMs) && syncedNowMs >= linkedSlotStartMs;
}

export function shouldRouteLinkedMatchRoomToRunning({
  flow,
  room,
  syncedNowMs,
}: {
  flow: PartyRunFlowSnapshot;
  room: RunningMatchRoom;
  syncedNowMs: number;
}) {
  return flow.canOpenLinkedMatch || hasRoomLinkedMatchSlotStarted(room, syncedNowMs);
}
