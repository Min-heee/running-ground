import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFriendLeaderboard } from '@/services/friendsService';
import { getApiErrorMessage } from '@/services/apiError';
import { fetchRunningMatchRoom } from '@/services/matchService';
import type { FriendLeaderboardResponse, RunningMatchRoom } from '@/lib/api/types';
import { isMatchRoomExiting } from '@/features/runs/matchRoomExitGuard';
import {
  parseServerNowMs,
  resolveStableServerClockOffset,
  shouldAcceptServerSnapshot,
} from '@/features/runs/serverClockSync';
import { getCurrentUserProfile } from '@/lib/session';
import { rgPerfMark, rgPerfMeasureStart, rgPerfTrackResource } from '@/utils/rgPerfTrace';

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
  const roomRenderKeyRef = useRef<string | null>(null);
  const pollingPausedRef = useRef(false);

  const [room, setRoom] = useState<RunningMatchRoom | null>(null);
  const [friendLeaderboard, setFriendLeaderboard] = useState<FriendLeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pollingPaused, setPollingPaused] = useState(false);
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
    setRoom(nextRoom);
  }, []);

  const loadRoom = useCallback(async () => {
    if (pollingPausedRef.current) {
      return null;
    }

    const endActiveRoomCheckTrace = rgPerfMeasureStart('active room check', {
      source: 'match-room snapshot',
    });

    try {
      const payload = await fetchRunningMatchRoom();
      endActiveRoomCheckTrace({
        roomId: payload.room?.roomId ?? null,
        success: true,
      });
      if (pollingPausedRef.current) {
        return null;
      }

      if (!shouldAcceptServerSnapshot(latestRoomServerNowMsRef, payload.serverNow)) {
        return null;
      }

      syncServerClock(payload.serverNow);
      if (payload.room) {
        rgPerfMark('already joined room detected', {
          roomId: payload.room.roomId,
          source: 'match-room snapshot',
          state: payload.room.state,
        });
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

      const nextRoom = payload.room;
      commitRoom(nextRoom);
      setError(null);
      return nextRoom;
    } catch (roomError) {
      endActiveRoomCheckTrace({ success: false });
      if (pollingPausedRef.current) {
        return null;
      }

      setError(getApiErrorMessage(roomError, '대기실을 불러오지 못했어.'));
      return null;
    }
  }, [commitRoom, syncServerClock]);

  const pauseRoomPolling = useCallback(() => {
    pollingPausedRef.current = true;
    setPollingPaused(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (pollingPaused) {
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
    rgPerfMark('match polling start', {
      intervalMs,
      source: 'match-room snapshot',
    });
    const stopPollingTrace = rgPerfTrackResource('polling', 'match-room snapshot polling', {
      intervalMs,
      linkedMatchId: room?.linkedMatchId ?? null,
    });
    const intervalId = setInterval(() => {
      void loadRoom();
    }, intervalMs);

    return () => {
      cancelled = true;
      stopPollingTrace();
      clearInterval(intervalId);
    };
  }, [loadRoom, pollingPaused, room?.linkedMatchId]);

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
