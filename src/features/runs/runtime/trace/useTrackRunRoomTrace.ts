import { useEffect } from 'react';

import type { TrackRunRoomTraceInput } from './types';

export function useTrackRunRoomTrace({
  roomLinkedMatchContext,
  roomLinkedMatchContextRef,
}: TrackRunRoomTraceInput) {
  useEffect(() => {
    roomLinkedMatchContextRef.current = roomLinkedMatchContext;
  }, [roomLinkedMatchContext, roomLinkedMatchContextRef]);
}
