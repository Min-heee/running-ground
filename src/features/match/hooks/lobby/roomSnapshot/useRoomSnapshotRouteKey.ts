import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import type { OptimisticMatchRoomHydration } from '../optimisticRoomHydration';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { buildMatchRoomSnapshotRouteKey } from './lobbyHydrationGuard';

export function useRoomSnapshotRouteKey({
  optimisticRoomHydration,
  optimisticRouteKeyLoggedRef,
  pollingPausedRef,
  roomRef,
  screenFocusedRef,
}: {
  optimisticRoomHydration: OptimisticMatchRoomHydration | null;
  optimisticRouteKeyLoggedRef: MutableRefObject<boolean>;
  pollingPausedRef: MutableRefObject<boolean>;
  roomRef: MutableRefObject<RunningMatchRoom | null>;
  screenFocusedRef: MutableRefObject<boolean>;
}) {
  return useCallback(() => {
    const routeKey = buildMatchRoomSnapshotRouteKey({
      isFocused: screenFocusedRef.current,
      isPollingPaused: pollingPausedRef.current,
      room: roomRef.current,
    });

    if (
      optimisticRoomHydration
      && roomRef.current?.roomId
      && !optimisticRouteKeyLoggedRef.current
    ) {
      optimisticRouteKeyLoggedRef.current = true;
      rgPerfMark('lobby route key hydrated from created room', {
        roomId: roomRef.current.roomId,
        routeKey,
        source: optimisticRoomHydration.source,
        state: roomRef.current.state,
      });
    }

    return routeKey;
  }, [
    optimisticRoomHydration,
    optimisticRouteKeyLoggedRef,
    pollingPausedRef,
    roomRef,
    screenFocusedRef,
  ]);
}
