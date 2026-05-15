import type { RunningMatchRoom } from '@/lib/api/types';
import type { OptimisticMatchRoomHydration } from '../optimisticRoomHydration';

export function buildMatchRoomSnapshotRouteKey({
  isFocused,
  isPollingPaused,
  room,
}: {
  isFocused: boolean;
  isPollingPaused: boolean;
  room: RunningMatchRoom | null;
}) {
  return [
    'match-room',
    isFocused ? 'focused' : 'blurred',
    isPollingPaused ? 'paused' : 'polling',
    room?.roomId ?? 'no-room',
    room?.linkedMatchId ?? 'no-match',
  ].join(':');
}

export function shouldSuppressNoRoomStateDuringHydration({
  optimisticRoomHydration,
  room,
}: {
  optimisticRoomHydration: OptimisticMatchRoomHydration | null;
  room: RunningMatchRoom | null;
}) {
  return Boolean(
    optimisticRoomHydration?.room.roomId
    && room?.roomId
    && optimisticRoomHydration.room.roomId === room.roomId,
  );
}
