import { useState } from 'react';
import type { FriendLeaderboardResponse } from '@/lib/api/types';
import { getCurrentUserProfile } from '@/lib/session';
import { useLobbyHydrationState } from './useLobbyHydrationState';
import { useRoomSnapshotFetcher } from './useRoomSnapshotFetcher';
import { useRoomSnapshotPolling } from './useRoomSnapshotPolling';
import { useActiveRoomSnapshotHandler } from './useActiveRoomSnapshotHandler';
import { useRoomSnapshotRuntimeRefs } from './useRoomSnapshotRuntimeRefs';
import { useRoomSnapshotHandoff } from './useRoomSnapshotHandoff';
import { useRoomSnapshotFocusState } from './useRoomSnapshotFocusState';
import { useRoomSnapshotForegroundRefresh } from './useRoomSnapshotForegroundRefresh';
import { useRoomSnapshotRouteKey } from './useRoomSnapshotRouteKey';
import { useLobbyHydrationSuppressionTrace } from './useLobbyHydrationSuppressionTrace';

export function useRoomSnapshotRuntime() {
  const currentUser = getCurrentUserProfile();
  const currentUserTag = currentUser?.publicTag ?? 'mock-current-user';
  const hydration = useLobbyHydrationState();
  const [friendLeaderboard, setFriendLeaderboard] = useState<FriendLeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refs = useRoomSnapshotRuntimeRefs();
  const handoff = useRoomSnapshotHandoff({ setLoading: hydration.setLoading });
  const { screenFocused } = useRoomSnapshotFocusState({
    mountedRef: refs.mountedRef,
    screenFocusedRef: refs.screenFocusedRef,
  });
  const buildRouteKey = useRoomSnapshotRouteKey({
    optimisticRoomHydration: hydration.optimisticRoomHydration,
    optimisticRouteKeyLoggedRef: hydration.optimisticRouteKeyLoggedRef,
    pollingPausedRef: handoff.pollingPausedRef,
    roomRef: hydration.roomRef,
    screenFocusedRef: refs.screenFocusedRef,
  });
  useLobbyHydrationSuppressionTrace({
    optimisticRoomHydration: hydration.optimisticRoomHydration,
    room: hydration.room,
  });

  const handleActiveRoomSnapshotResult = useActiveRoomSnapshotHandler({
    buildRouteKey,
    commitRoom: hydration.commitRoom,
    currentUserTag,
    lastDisplayedInviteKeyRef: refs.lastDisplayedInviteKeyRef,
    lastHandledActiveRoomSnapshotKeyRef: refs.lastHandledActiveRoomSnapshotKeyRef,
    latestRoomServerNowMsRef: hydration.latestRoomServerNowMsRef,
    liveMatchHandoffRef: handoff.liveMatchHandoffRef,
    markLiveMatchHandoff: handoff.markLiveMatchHandoff,
    mountedRef: refs.mountedRef,
    pollingPausedRef: handoff.pollingPausedRef,
    roomRef: hydration.roomRef,
    setError,
    syncServerClock: hydration.syncServerClock,
  });

  const loadRoom = useRoomSnapshotFetcher({
    buildRouteKey,
    handleActiveRoomSnapshotResult,
    lastInviteInboxPollStartedAtRef: refs.lastInviteInboxPollStartedAtRef,
    mountedRef: refs.mountedRef,
    pollingPausedRef: handoff.pollingPausedRef,
    recipientUserId: currentUserTag,
    roomRef: hydration.roomRef,
    screenFocusedRef: refs.screenFocusedRef,
    setError,
  });

  useRoomSnapshotForegroundRefresh({
    loadRoom,
    mountedRef: refs.mountedRef,
    pollingPausedRef: handoff.pollingPausedRef,
    screenFocusedRef: refs.screenFocusedRef,
  });

  useRoomSnapshotPolling({
    currentUserTag,
    loadRoom,
    pollingPaused: handoff.pollingPaused,
    room: hydration.room,
    screenFocused,
    setFriendLeaderboard,
    setLoading: hydration.setLoading,
  });

  return {
    room: hydration.room,
    friendLeaderboard,
    error,
    setError,
    loading: hydration.loading,
    currentUserTag,
    serverClockOffsetMs: hydration.serverClockOffsetMs,
    latestRoomServerNowMsRef: hydration.latestRoomServerNowMsRef,
    commitRoom: hydration.commitRoom,
    pauseRoomPolling: handoff.pauseRoomPolling,
    syncServerClock: hydration.syncServerClock,
  };
}
