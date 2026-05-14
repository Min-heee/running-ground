import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState, Platform } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { fetchFriendLeaderboard } from '@/services/friendsService';
import { getApiErrorMessage } from '@/services/apiError';
import type { FriendLeaderboardResponse, RunningMatchRoom } from '@/lib/api/types';
import { isMatchRoomExiting } from '@/features/runs/lifecycle/matchRoomExitGuard';
import {
  getActiveRoomCheckResultSkipReason,
  runActiveRoomCheck,
} from '@/features/runs/sync/activeRoomCheck';
import {
  buildActiveRoomResultLogDetail,
  buildActiveRoomSnapshotKey,
} from '@/features/runs/sync/activeRoomResult';
import {
  buildRoomInviteInboxEvent,
  shouldDisplayRoomInviteCard,
} from '@/features/runs/sync/roomInviteInbox';
import {
  parseServerNowMs,
  resolveStableServerClockOffset,
  shouldAcceptServerSnapshot,
} from '@/features/runs/sync/serverClockSync';
import { getCurrentUserProfile } from '@/lib/session';
import { rgPerfMark, rgPerfMeasureStart, rgPerfTrackResource } from '@/utils/rgPerfTrace';
import { acquireRgPollingSlot } from '@/utils/rgPollingRegistry';

const INVITE_INBOX_ANDROID_FOCUSED_POLL_MS = 4_000;
const INVITE_INBOX_DEFAULT_FOCUSED_POLL_MS = 1_500;
const INVITE_INBOX_ANDROID_DEBOUNCE_MS = 2_500;
const INVITE_INBOX_DEFAULT_DEBOUNCE_MS = 800;

function getFocusedInviteInboxPollMs() {
  return Platform.OS === 'android'
    ? INVITE_INBOX_ANDROID_FOCUSED_POLL_MS
    : INVITE_INBOX_DEFAULT_FOCUSED_POLL_MS;
}

function getInviteInboxDebounceMs() {
  return Platform.OS === 'android'
    ? INVITE_INBOX_ANDROID_DEBOUNCE_MS
    : INVITE_INBOX_DEFAULT_DEBOUNCE_MS;
}

function buildRoomRenderKey(room: RunningMatchRoom | null) {
  if (!room) {
    return 'empty';
  }

  return [
    room.roomId,
    room.state,
    room.startMode,
    room.distanceKm,
    room.slotStartAt,
    room.maxParticipants,
    room.canStart ? 'can-start' : 'cannot-start',
    room.linkedMatchId ?? 'no-match',
    room.linkedMatchStatus ?? 'no-status',
    room.linkedMatchSlotStartAt ?? 'no-linked-slot',
    room.joined === false ? 'invited-only' : 'joined',
    room.invitedFriendIds.join('|'),
    room.invitedFriends?.map((friend) => [friend.userId, friend.name, friend.status].join(':')).join('|') ?? 'no-invites',
    room.participants.map((participant) => [
      participant.userId,
      participant.isReady ? 'ready' : 'waiting',
      participant.isCountdownReady ? 'loaded' : 'loading',
    ].join(':')).join('|'),
  ].join('::');
}

function resolveMatchRoomSnapshotPollingPolicy({
  linkedMatchId,
  state,
}: {
  linkedMatchId?: string | null;
  state?: RunningMatchRoom['state'] | null;
}) {
  if (linkedMatchId && state === 'active') {
    return {
      enabled: false,
      intervalMs: 5000,
      owner: 'linked match status',
      reason: 'active-live-match-owner',
    };
  }

  if (linkedMatchId) {
    return {
      enabled: true,
      intervalMs: 5000,
      owner: 'match-room snapshot',
      reason: `${state ?? 'linked'}-minimal-room-sync`,
    };
  }

  return {
    enabled: true,
    intervalMs: getFocusedInviteInboxPollMs(),
    owner: 'match-room snapshot',
    reason: 'waiting-room-sync',
  };
}

export function useRoomSnapshot() {
  const currentUser = getCurrentUserProfile();
  const currentUserTag = currentUser?.publicTag ?? 'mock-current-user';
  const latestRoomServerNowMsRef = useRef(0);
  const lastHandledActiveRoomSnapshotKeyRef = useRef<string | null>(null);
  const lastDisplayedInviteKeyRef = useRef<string | null>(null);
  const roomRenderKeyRef = useRef<string | null>(null);
  const roomRef = useRef<RunningMatchRoom | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastInviteInboxPollStartedAtRef = useRef(0);
  const pollingPausedRef = useRef(false);
  const screenFocusedRef = useRef(false);
  const mountedRef = useRef(true);

  const [room, setRoom] = useState<RunningMatchRoom | null>(null);
  const [friendLeaderboard, setFriendLeaderboard] = useState<FriendLeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pollingPaused, setPollingPaused] = useState(false);
  const [screenFocused, setScreenFocused] = useState(false);
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);

  const syncServerClock = useCallback((serverNow?: string) => {
    const serverNowMs = parseServerNowMs(serverNow);
    if (serverNowMs === null) {
      return;
    }

    const nextOffsetMs = serverNowMs - Date.now();
    setServerClockOffsetMs((currentOffsetMs) => resolveStableServerClockOffset(currentOffsetMs, nextOffsetMs));
  }, []);

  const commitRoom = useCallback((nextRoom: RunningMatchRoom | null) => {
    const nextKey = buildRoomRenderKey(nextRoom);
    if (roomRenderKeyRef.current === nextKey) {
      return;
    }

    roomRenderKeyRef.current = nextKey;
    roomRef.current = nextRoom;
    setRoom(nextRoom);
  }, []);

  const buildMatchRoomActiveRoomCheckRouteKey = useCallback(() => [
    'match-room',
    screenFocusedRef.current ? 'focused' : 'blurred',
    pollingPausedRef.current ? 'paused' : 'polling',
    roomRef.current?.roomId ?? 'no-room',
    roomRef.current?.linkedMatchId ?? 'no-match',
  ].join(':'), []);

  const loadRoom = useCallback(async () => {
    if (pollingPausedRef.current || !screenFocusedRef.current) {
      rgPerfMark('invite inbox polling skipped idle', {
        paused: pollingPausedRef.current,
        source: 'match-room snapshot',
        focused: screenFocusedRef.current,
      });
      return null;
    }

    const routeKey = buildMatchRoomActiveRoomCheckRouteKey();
    const nowMs = Date.now();
    const debounceMs = getInviteInboxDebounceMs();
    const elapsedSinceLastPollMs = nowMs - lastInviteInboxPollStartedAtRef.current;

    if (lastInviteInboxPollStartedAtRef.current && elapsedSinceLastPollMs < debounceMs) {
      rgPerfMark('invite inbox polling debounced', {
        debounceMs,
        elapsedMs: elapsedSinceLastPollMs,
        routeKey,
        source: 'match-room snapshot',
      });
      return roomRef.current;
    }

    lastInviteInboxPollStartedAtRef.current = nowMs;
    const endInviteInboxPollingTrace = rgPerfMeasureStart('invite inbox polling', {
      routeKey,
      source: 'match-room snapshot',
    });

    try {
      const activeRoomCheckResult = await runActiveRoomCheck({
        routeKey,
        source: 'match-room snapshot',
      });
      endInviteInboxPollingTrace({
        requestId: activeRoomCheckResult.requestId,
        success: true,
      });
      const currentRouteKey = buildMatchRoomActiveRoomCheckRouteKey();
      const skipReason = getActiveRoomCheckResultSkipReason({
        currentMatchId: roomRef.current?.linkedMatchId ?? null,
        currentRouteKey,
        result: activeRoomCheckResult,
      });

      if (skipReason) {
        const logDetail = {
          currentRouteKey,
          generation: activeRoomCheckResult.generation,
          reason: skipReason,
          requestId: activeRoomCheckResult.requestId,
          routeKey: activeRoomCheckResult.routeKey,
          source: 'match-room snapshot',
        };

        if (skipReason === 'stale-generation') {
          rgPerfMark('active room result skipped stale generation', logDetail);
        } else {
          rgPerfMark('active room result skipped duplicate', logDetail);
        }
        return null;
      }

      const payload = activeRoomCheckResult.payload;
      if (!payload) {
        return null;
      }

      if (!mountedRef.current || pollingPausedRef.current) {
        rgPerfMark('active room result skipped duplicate', {
          reason: !mountedRef.current ? 'unmounted' : 'already navigating',
          source: 'match-room snapshot',
        });
        return null;
      }

      if (!shouldAcceptServerSnapshot(latestRoomServerNowMsRef, payload.serverNow)) {
        rgPerfMark('active room result skipped duplicate', {
          reason: 'stale result',
          source: 'match-room snapshot',
        });
        return null;
      }

      if (isMatchRoomExiting(payload.room?.roomId)) {
        const endStaleCleanupTrace = rgPerfMeasureStart('stale room cleanup', {
          roomId: payload.room?.roomId ?? null,
          source: 'match-room exit guard',
        });
        commitRoom(null);
        endStaleCleanupTrace({ success: true });
        setError(null);
        return null;
      }

      const snapshotKey = buildActiveRoomSnapshotKey({
        room: payload.room,
        userId: currentUserTag,
      });
      if (lastHandledActiveRoomSnapshotKeyRef.current === snapshotKey) {
        rgPerfMark('active room result skipped duplicate', buildActiveRoomResultLogDetail({
          reason: 'same room snapshot',
          room: payload.room,
          snapshotKey,
          source: 'match-room snapshot',
        }));
        return roomRef.current;
      }

      lastHandledActiveRoomSnapshotKeyRef.current = snapshotKey;
      rgPerfMark('active room result handled', buildActiveRoomResultLogDetail({
        room: payload.room,
        snapshotKey,
        source: 'match-room snapshot',
      }));

      syncServerClock(payload.serverNow);
      if (payload.room) {
        rgPerfMark('already joined room detected', {
          roomId: payload.room.roomId,
          source: 'match-room snapshot',
          state: payload.room.state,
        });
      }

      const nextRoom = payload.room;
      const inviteInboxEvent = buildRoomInviteInboxEvent(nextRoom, currentUserTag);
      if (inviteInboxEvent) {
        if (shouldDisplayRoomInviteCard(lastDisplayedInviteKeyRef.current, inviteInboxEvent)) {
          lastDisplayedInviteKeyRef.current = inviteInboxEvent.key;
          rgPerfMark('invite received', {
            inviteId: inviteInboxEvent.inviteId,
            invitedUserId: inviteInboxEvent.invitedUserId,
            roomId: inviteInboxEvent.roomId,
            source: 'invite inbox polling',
            state: inviteInboxEvent.roomState,
          });
          rgPerfMark('invite card displayed', {
            inviteId: inviteInboxEvent.inviteId,
            invitedUserId: inviteInboxEvent.invitedUserId,
            roomId: inviteInboxEvent.roomId,
            source: 'invite inbox polling',
            state: inviteInboxEvent.roomState,
          });
        } else {
          rgPerfMark('invite card display skipped duplicate', {
            inviteId: inviteInboxEvent.inviteId,
            invitedUserId: inviteInboxEvent.invitedUserId,
            roomId: inviteInboxEvent.roomId,
            source: 'invite inbox polling',
            state: inviteInboxEvent.roomState,
          });
        }
      }
      commitRoom(nextRoom);
      setError(null);
      return nextRoom;
    } catch (roomError) {
      endInviteInboxPollingTrace({
        success: false,
      });
      if (!mountedRef.current || pollingPausedRef.current) {
        return null;
      }

      setError(getApiErrorMessage(roomError, '대기실을 불러오지 못했어.'));
      return null;
    }
  }, [buildMatchRoomActiveRoomCheckRouteKey, commitRoom, currentUserTag, syncServerClock]);

  useEffect(() => () => {
    mountedRef.current = false;
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
        rgPerfMark('invite inbox polling focused only', {
          reason: 'foreground-once',
          source: 'match-room snapshot',
        });
        void loadRoom();
      }
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [loadRoom]);

  const pauseRoomPolling = useCallback(() => {
    pollingPausedRef.current = true;
    setPollingPaused(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (pollingPaused || !screenFocused) {
      rgPerfMark('invite inbox polling skipped idle', {
        paused: pollingPaused,
        source: 'match-room snapshot',
        focused: screenFocused,
      });
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    const pollingRoomId = room?.roomId ?? null;
    const pollingLinkedMatchId = room?.linkedMatchId ?? null;
    const pollingRoomState = room?.state ?? null;

    const hydrate = async () => {
      setLoading(true);
      const [nextRoom, friends] = await Promise.all([
        loadRoom(),
        fetchFriendLeaderboard().catch(() => null),
      ]);

      if (cancelled) {
        return;
      }

      if (friends) {
        setFriendLeaderboard(friends);
      }

      setLoading(false);
      return nextRoom;
    };

    void hydrate();
    const policy = resolveMatchRoomSnapshotPollingPolicy({
      linkedMatchId: pollingLinkedMatchId,
      state: pollingRoomState,
    });
    if (!policy.enabled) {
      rgPerfMark('match polling skipped', {
        linkedMatchId: pollingLinkedMatchId,
        owner: 'match-room snapshot',
        reason: policy.reason,
        roomId: pollingRoomId,
        state: pollingRoomState,
      });
      return () => {
        cancelled = true;
      };
    }

    const intervalMs = policy.intervalMs;
    const pollingKey = pollingRoomId
      ? `room:${pollingRoomId}:match-room-snapshot`
      : `active-room:${currentUserTag}:match-room-snapshot`;
    const pollingSlot = acquireRgPollingSlot(pollingKey, 'match-room snapshot polling', {
      intervalMs,
      linkedMatchId: pollingLinkedMatchId,
      owner: policy.owner,
      reason: policy.reason,
      roomId: pollingRoomId,
      source: 'match-room snapshot',
      state: pollingRoomState,
    });

    if (!pollingSlot.acquired) {
      return () => {
        cancelled = true;
      };
    }

    rgPerfMark('match polling start', {
      intervalMs,
      owner: policy.owner,
      pollingKey,
      reason: policy.reason,
      roomId: pollingRoomId,
      source: 'match-room snapshot',
      state: pollingRoomState,
    });
    rgPerfMark('invite inbox polling focused only', {
      intervalMs,
      owner: policy.owner,
      pollingKey,
      reason: policy.reason,
      roomId: pollingRoomId,
      source: 'match-room snapshot',
      state: pollingRoomState,
    });
    const stopPollingTrace = rgPerfTrackResource('polling', 'match-room snapshot polling', {
      intervalMs,
      linkedMatchId: pollingLinkedMatchId,
      owner: policy.owner,
      pollingKey,
      reason: policy.reason,
      roomId: pollingRoomId,
      state: pollingRoomState,
    });
    const intervalId = setInterval(() => {
      void loadRoom();
    }, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      stopPollingTrace();
      pollingSlot.release();
    };
  }, [currentUserTag, loadRoom, pollingPaused, room?.linkedMatchId, room?.roomId, room?.state, screenFocused]);

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
