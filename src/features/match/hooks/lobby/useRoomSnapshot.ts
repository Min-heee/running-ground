import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchFriendLeaderboard } from '@/services/friendsService';
import { getApiErrorMessage } from '@/services/apiError';
import type { FriendLeaderboardResponse, RunningMatchRoom } from '@/lib/api/types';
import { isMatchRoomExiting } from '@/features/runs/matchRoomExitGuard';
import { runActiveRoomCheck } from '@/features/runs/activeRoomCheck';
import {
  buildActiveRoomResultLogDetail,
  buildActiveRoomSnapshotKey,
} from '@/features/runs/activeRoomResult';
import {
  parseServerNowMs,
  resolveStableServerClockOffset,
  shouldAcceptServerSnapshot,
} from '@/features/runs/serverClockSync';
import { getCurrentUserProfile } from '@/lib/session';
import { rgPerfMark, rgPerfMeasureStart, rgPerfTrackResource } from '@/utils/rgPerfTrace';
import { acquireRgPollingSlot } from '@/utils/rgPollingRegistry';

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

export function useRoomSnapshot() {
  const currentUser = getCurrentUserProfile();
  const currentUserTag = currentUser?.publicTag ?? 'mock-current-user';
  const latestRoomServerNowMsRef = useRef(0);
  const lastHandledActiveRoomSnapshotKeyRef = useRef<string | null>(null);
  const roomRenderKeyRef = useRef<string | null>(null);
  const roomRef = useRef<RunningMatchRoom | null>(null);
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

  const loadRoom = useCallback(async () => {
    if (pollingPausedRef.current || !screenFocusedRef.current) {
      return null;
    }

    try {
      const { payload } = await runActiveRoomCheck({
        source: 'match-room snapshot',
      });
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
      commitRoom(nextRoom);
      setError(null);
      return nextRoom;
    } catch (roomError) {
      if (!mountedRef.current || pollingPausedRef.current) {
        return null;
      }

      setError(getApiErrorMessage(roomError, '대기실을 불러오지 못했어.'));
      return null;
    }
  }, [commitRoom, currentUserTag, syncServerClock]);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  useFocusEffect(useCallback(() => {
    screenFocusedRef.current = true;
    setScreenFocused(true);

    return () => {
      screenFocusedRef.current = false;
      setScreenFocused(false);
    };
  }, []));

  const pauseRoomPolling = useCallback(() => {
    pollingPausedRef.current = true;
    setPollingPaused(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (pollingPaused || !screenFocused) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

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
    const intervalMs = room?.linkedMatchId ? 750 : 1500;
    const pollingKey = room?.roomId
      ? `room:${room.roomId}:match-room-snapshot`
      : `active-room:${currentUserTag}:match-room-snapshot`;
    const pollingSlot = acquireRgPollingSlot(pollingKey, 'match-room snapshot polling', {
      intervalMs,
      linkedMatchId: room?.linkedMatchId ?? null,
      roomId: room?.roomId ?? null,
      source: 'match-room snapshot',
    });

    if (!pollingSlot.acquired) {
      return () => {
        cancelled = true;
      };
    }

    rgPerfMark('match polling start', {
      intervalMs,
      pollingKey,
      roomId: room?.roomId ?? null,
      source: 'match-room snapshot',
    });
    const stopPollingTrace = rgPerfTrackResource('polling', 'match-room snapshot polling', {
      intervalMs,
      linkedMatchId: room?.linkedMatchId ?? null,
      pollingKey,
      roomId: room?.roomId ?? null,
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
  }, [currentUserTag, loadRoom, pollingPaused, room?.linkedMatchId, room?.roomId, screenFocused]);

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
