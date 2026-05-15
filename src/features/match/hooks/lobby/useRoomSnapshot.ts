import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import type { FriendLeaderboardResponse, RunningMatchRoom } from '@/lib/api/types';
import { getCurrentUserProfile } from '@/lib/session';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import {
  ACTIVE_ROOM_FOREGROUND_DEBOUNCE_MS,
  getFocusedInviteInboxPollMs,
} from './roomSnapshot/roomSnapshotPollingPolicy';
import { useLobbyHydrationState } from './roomSnapshot/useLobbyHydrationState';
import { useRoomSnapshotFetcher } from './roomSnapshot/useRoomSnapshotFetcher';
import { useRoomSnapshotPolling } from './roomSnapshot/useRoomSnapshotPolling';

export function useRoomSnapshot() {
  const currentUser = getCurrentUserProfile();
  const currentUserTag = currentUser?.publicTag ?? 'mock-current-user';
  const {
    commitRoom,
    latestRoomServerNowMsRef,
    loading,
    optimisticRoomHydration,
    optimisticRouteKeyLoggedRef,
    room,
    roomRef,
    serverClockOffsetMs,
    setLoading,
    syncServerClock,
  } = useLobbyHydrationState();
  const lastHandledActiveRoomSnapshotKeyRef = useRef<string | null>(null);
  const lastDisplayedInviteKeyRef = useRef<string | null>(null);
  const liveMatchHandoffRef = useRef<{ matchId: string; roomId: string } | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastInviteInboxPollStartedAtRef = useRef(0);
  const pollingPausedRef = useRef(false);
  const screenFocusedRef = useRef(false);
  const mountedRef = useRef(true);
  const foregroundDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [friendLeaderboard, setFriendLeaderboard] = useState<FriendLeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollingPaused, setPollingPaused] = useState(false);
  const [screenFocused, setScreenFocused] = useState(false);

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

  const buildMatchRoomActiveRoomCheckRouteKey = useCallback(() => {
    const routeKey = [
      'match-room',
      screenFocusedRef.current ? 'focused' : 'blurred',
      pollingPausedRef.current ? 'paused' : 'polling',
      roomRef.current?.roomId ?? 'no-room',
      roomRef.current?.linkedMatchId ?? 'no-match',
    ].join(':');

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
  }, [optimisticRoomHydration, optimisticRouteKeyLoggedRef, roomRef]);

  const loadRoom = useRoomSnapshotFetcher({
    buildRouteKey: buildMatchRoomActiveRoomCheckRouteKey,
    commitRoom,
    currentUserTag,
    lastDisplayedInviteKeyRef,
    lastHandledActiveRoomSnapshotKeyRef,
    lastInviteInboxPollStartedAtRef,
    latestRoomServerNowMsRef,
    liveMatchHandoffRef,
    markLiveMatchHandoff,
    mountedRef,
    pollingPausedRef,
    roomRef,
    screenFocusedRef,
    setError,
    syncServerClock,
  });

  useEffect(() => {
    if (!optimisticRoomHydration?.room) {
      return;
    }

    rgPerfMark('lobby no-room state suppressed during hydration', {
      roomId: optimisticRoomHydration.room.roomId,
      source: optimisticRoomHydration.source,
      state: optimisticRoomHydration.room.state,
    });
  }, [optimisticRoomHydration]);

  useEffect(() => () => {
    mountedRef.current = false;
    if (foregroundDebounceTimerRef.current) {
      clearTimeout(foregroundDebounceTimerRef.current);
      foregroundDebounceTimerRef.current = null;
    }
  }, []);

  useFocusEffect(useCallback(() => {
    screenFocusedRef.current = true;
    setScreenFocused(true);
    rgPerfMark('invite inbox polling focused only', {
      focused: true,
      intervalMs: getFocusedInviteInboxPollMs(),
      source: 'match-room snapshot',
    });

    return () => {
      screenFocusedRef.current = false;
      setScreenFocused(false);
    };
  }, []));

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (
        previousState !== 'active'
        && nextState === 'active'
        && screenFocusedRef.current
        && !pollingPausedRef.current
      ) {
        if (foregroundDebounceTimerRef.current) {
          clearTimeout(foregroundDebounceTimerRef.current);
        }
        rgPerfMark('active room check foreground debounce', {
          delayMs: ACTIVE_ROOM_FOREGROUND_DEBOUNCE_MS,
          source: 'match-room snapshot',
        });
        rgPerfMark('invite inbox polling focused only', {
          debounceMs: ACTIVE_ROOM_FOREGROUND_DEBOUNCE_MS,
          reason: 'foreground-once',
          source: 'match-room snapshot',
        });
        foregroundDebounceTimerRef.current = setTimeout(() => {
          foregroundDebounceTimerRef.current = null;
          if (!mountedRef.current || !screenFocusedRef.current || pollingPausedRef.current) {
            return;
          }
          void loadRoom();
        }, ACTIVE_ROOM_FOREGROUND_DEBOUNCE_MS);
      }
    });

    return () => {
      if (foregroundDebounceTimerRef.current) {
        clearTimeout(foregroundDebounceTimerRef.current);
        foregroundDebounceTimerRef.current = null;
      }
      appStateSubscription.remove();
    };
  }, [loadRoom]);

  const pauseRoomPolling = useCallback(() => {
    pollingPausedRef.current = true;
    setPollingPaused(true);
    setLoading(false);
  }, [setLoading]);

  useRoomSnapshotPolling({
    currentUserTag,
    loadRoom,
    pollingPaused,
    room,
    screenFocused,
    setFriendLeaderboard,
    setLoading,
  });

  return {
    room,
    friendLeaderboard,
    error,
    setError,
    loading,
    currentUserTag,
    serverClockOffsetMs,
    latestRoomServerNowMsRef,
    commitRoom,
    pauseRoomPolling,
    syncServerClock,
  };
}
