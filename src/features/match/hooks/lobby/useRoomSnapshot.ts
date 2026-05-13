import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFriendLeaderboard } from '@/services/friendsService';
import { getApiErrorMessage } from '@/services/apiError';
import { fetchRunningMatchRoom } from '@/services/matchService';
import type { FriendLeaderboardResponse, RunningMatchRoom } from '@/lib/api/types';
import {
  parseServerNowMs,
  resolveStableServerClockOffset,
  shouldAcceptServerSnapshot,
} from '@/features/runs/serverClockSync';
import { getCurrentUserProfile } from '@/lib/session';

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

  const [room, setRoom] = useState<RunningMatchRoom | null>(null);
  const [friendLeaderboard, setFriendLeaderboard] = useState<FriendLeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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
    try {
      const payload = await fetchRunningMatchRoom();
      if (!shouldAcceptServerSnapshot(latestRoomServerNowMsRef, payload.serverNow)) {
        return null;
      }

      syncServerClock(payload.serverNow);
      commitRoom(payload.room);
      setError(null);
      return payload.room;
    } catch (roomError) {
      setError(getApiErrorMessage(roomError, '대기실을 불러오지 못했어.'));
      return null;
    }
  }, [commitRoom, syncServerClock]);

  useEffect(() => {
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
    const intervalId = setInterval(() => {
      void loadRoom();
    }, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [loadRoom, room?.linkedMatchId]);

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
    syncServerClock,
  };
}
