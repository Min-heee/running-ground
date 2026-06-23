import { useEffect } from 'react';

import type { TrackRunRoomTraceInput } from './types';

export function useTrackRunRoomTrace({
  roomLinkedMatchContext,
  roomLinkedMatchContextRef,
  wasPartyRunRef,
}: TrackRunRoomTraceInput) {
  useEffect(() => {
    roomLinkedMatchContextRef.current = roomLinkedMatchContext;
    // Latch party-ness the moment it is observed and NEVER auto-clear it here: the live
    // context is ephemeral and drops to null on an early forfeit before the save reads it.
    // The latch is reset only by the post-run runtime reset, so the next official run is clean.
    if (roomLinkedMatchContext) {
      wasPartyRunRef.current = true;
    }
  }, [roomLinkedMatchContext, roomLinkedMatchContextRef, wasPartyRunRef]);
}
