import type { RunningMatchRoom } from '@/lib/api/types';
import type { PartyRunFlowSnapshot } from '@/features/runs/lifecycle/matchStateMachine';

// A host-start room that has already produced a linked match is past 시작 — the buffer has begun.
// Routing the guest to the running tab NOW (while roomState is still 'arming') mounts the running
// screen showing 로딩중 BEFORE the visible 10s countdown, so the digit appears at "10" on an
// already-mounted, clock-synced tab instead of mid-route at ~7. This is routing ONLY — the arena
// force-open stays slot-gated (forceMatchArena/preferArena are sent only when flow.shouldOpenArena,
// which arming does NOT set), so the guest does not start MEASURING early.
export function hasHostStartRoomEnteredArmingBuffer(room: RunningMatchRoom) {
  return Boolean(room.linkedMatchId && room.startMode === 'host');
}

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
  return (
    flow.canOpenLinkedMatch
    || hasRoomLinkedMatchSlotStarted(room, syncedNowMs)
    || hasHostStartRoomEnteredArmingBuffer(room)
  );
}
