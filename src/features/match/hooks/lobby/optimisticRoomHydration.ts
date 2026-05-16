import type { RunningMatchRoom } from '@/lib/api/types';
import { isMatchRoomDeleted } from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import { rgPerfMark } from '@/utils/rgPerfTrace';

const OPTIMISTIC_ROOM_HYDRATION_TTL_MS = 30_000;

export type OptimisticMatchRoomHydration = {
  createdAtMs: number;
  room: RunningMatchRoom;
  serverNow?: string;
  source: string;
};

let pendingOptimisticRoomHydration: OptimisticMatchRoomHydration | null = null;

export function hydrateOptimisticMatchRoom({
  room,
  serverNow,
  source,
  nowMs = Date.now(),
}: {
  nowMs?: number;
  room: RunningMatchRoom | null | undefined;
  serverNow?: string;
  source: string;
}) {
  if (!room?.roomId) {
    return;
  }

  if (isMatchRoomDeleted(room.roomId, nowMs)) {
    rgPerfMark('room hydrate skipped deleted room', {
      roomId: room.roomId,
      source,
      state: room.state,
    });
    return;
  }

  pendingOptimisticRoomHydration = {
    createdAtMs: nowMs,
    room,
    serverNow,
    source,
  };

  rgPerfMark('lobby optimistic room hydrated', {
    roomId: room.roomId,
    source,
    state: room.state,
  });
}

export function consumeOptimisticMatchRoomHydration(nowMs = Date.now()) {
  const hydration = pendingOptimisticRoomHydration;
  pendingOptimisticRoomHydration = null;

  if (!hydration) {
    return null;
  }

  if (nowMs - hydration.createdAtMs > OPTIMISTIC_ROOM_HYDRATION_TTL_MS) {
    return null;
  }

  if (isMatchRoomDeleted(hydration.room.roomId, nowMs)) {
    rgPerfMark('room hydrate skipped deleted room', {
      roomId: hydration.room.roomId,
      source: hydration.source,
      state: hydration.room.state,
    });
    return null;
  }

  return hydration;
}
