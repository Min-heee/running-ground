import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { fetchFriendLeaderboard } from '@/services/friendsService';
import type { FriendLeaderboardResponse, RunningMatchRoom } from '@/lib/api/types';
import { rgPerfMark, rgPerfTrackResource } from '@/utils/rgPerfTrace';
import { acquireRgPollingSlot } from '@/utils/rgPollingRegistry';
import { resolveMatchRoomSnapshotPollingPolicy } from './roomSnapshotPollingPolicy';

export function useRoomSnapshotPolling({
  currentUserTag,
  loadRoom,
  pollingPaused,
  room,
  screenFocused,
  setFriendLeaderboard,
  setLoading,
}: {
  currentUserTag: string;
  loadRoom: () => Promise<RunningMatchRoom | null>;
  pollingPaused: boolean;
  room: RunningMatchRoom | null;
  screenFocused: boolean;
  setFriendLeaderboard: Dispatch<SetStateAction<FriendLeaderboardResponse | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
}) {
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
      rgPerfMark('match-room polling stopped after handoff', {
        linkedMatchId: pollingLinkedMatchId,
        owner: policy.owner,
        reason: policy.reason,
        roomId: pollingRoomId,
        source: 'match-room snapshot',
        state: pollingRoomState,
      });
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

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
  }, [
    currentUserTag,
    loadRoom,
    pollingPaused,
    room?.linkedMatchId,
    room?.roomId,
    room?.state,
    screenFocused,
    setFriendLeaderboard,
    setLoading,
  ]);
}
