import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import type { runActiveRoomCheck } from '@/features/runs/sync/activeRoomCheck';
import { handleMatchRoomActiveRoomResult } from './activeRoomResultHandler';
import { useInviteInboxReceiver } from './useInviteInboxReceiver';

type ActiveRoomCheckResult = Awaited<ReturnType<typeof runActiveRoomCheck>>;

export function useActiveRoomSnapshotHandler({
  buildRouteKey,
  commitRoom,
  currentUserTag,
  lastDisplayedInviteKeyRef,
  lastHandledActiveRoomSnapshotKeyRef,
  latestRoomServerNowMsRef,
  liveMatchHandoffRef,
  markLiveMatchHandoff,
  mountedRef,
  pollingPausedRef,
  roomRef,
  setError,
  syncServerClock,
}: {
  buildRouteKey: () => string;
  commitRoom: (nextRoom: RunningMatchRoom | null) => void;
  currentUserTag: string;
  lastDisplayedInviteKeyRef: MutableRefObject<string | null>;
  lastHandledActiveRoomSnapshotKeyRef: MutableRefObject<string | null>;
  latestRoomServerNowMsRef: MutableRefObject<number>;
  liveMatchHandoffRef: MutableRefObject<{ matchId: string; roomId: string } | null>;
  markLiveMatchHandoff: (nextRoom: RunningMatchRoom, source: string) => void;
  mountedRef: MutableRefObject<boolean>;
  pollingPausedRef: MutableRefObject<boolean>;
  roomRef: MutableRefObject<RunningMatchRoom | null>;
  setError: Dispatch<SetStateAction<string | null>>;
  syncServerClock: (serverNow?: string, timingSource?: unknown) => void;
}) {
  const handleRecipientInviteInbox = useInviteInboxReceiver({
    currentUserTag,
    lastDisplayedInviteKeyRef,
  });

  return useCallback((activeRoomCheckResult: ActiveRoomCheckResult) => handleMatchRoomActiveRoomResult({
    activeRoomCheckResult,
    buildRouteKey,
    commitRoom,
    currentUserTag,
    handleRecipientInviteInbox,
    lastHandledActiveRoomSnapshotKeyRef,
    latestRoomServerNowMsRef,
    liveMatchHandoffRef,
    markLiveMatchHandoff,
    mountedRef,
    pollingPausedRef,
    roomRef,
    setError,
    syncServerClock,
  }), [
    buildRouteKey,
    commitRoom,
    currentUserTag,
    handleRecipientInviteInbox,
    lastHandledActiveRoomSnapshotKeyRef,
    latestRoomServerNowMsRef,
    liveMatchHandoffRef,
    markLiveMatchHandoff,
    mountedRef,
    pollingPausedRef,
    roomRef,
    setError,
    syncServerClock,
  ]);
}
