import { useCallback, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import { rgPerfMark } from '@/utils/rgPerfTrace';

export function useRoomSnapshotHandoff({
  setLoading,
}: {
  setLoading: Dispatch<SetStateAction<boolean>>;
}) {
  const liveMatchHandoffRef = useRef<{ matchId: string; roomId: string } | null>(null);
  const pollingPausedRef = useRef(false);
  const [pollingPaused, setPollingPaused] = useState(false);

  const pauseRoomPolling = useCallback(() => {
    pollingPausedRef.current = true;
    setPollingPaused(true);
    setLoading(false);
  }, [setLoading]);

  const markLiveMatchHandoff = useCallback((nextRoom: RunningMatchRoom, source: string) => {
    if (!nextRoom.linkedMatchId) {
      return;
    }

    const currentHandoff = liveMatchHandoffRef.current;
    if (currentHandoff?.roomId === nextRoom.roomId && currentHandoff.matchId === nextRoom.linkedMatchId) {
      return;
    }

    liveMatchHandoffRef.current = {
      matchId: nextRoom.linkedMatchId,
      roomId: nextRoom.roomId,
    };
    pollingPausedRef.current = true;
    setPollingPaused(true);
    setLoading(false);
    rgPerfMark('match lifecycle owner handoff to live match', {
      matchId: nextRoom.linkedMatchId,
      roomId: nextRoom.roomId,
      source,
      state: nextRoom.state,
    });
    rgPerfMark('match-room polling stopped after handoff', {
      matchId: nextRoom.linkedMatchId,
      roomId: nextRoom.roomId,
      source,
      state: nextRoom.state,
    });
  }, [setLoading]);

  return {
    liveMatchHandoffRef: liveMatchHandoffRef as MutableRefObject<{ matchId: string; roomId: string } | null>,
    markLiveMatchHandoff,
    pauseRoomPolling,
    pollingPaused,
    pollingPausedRef,
  };
}
