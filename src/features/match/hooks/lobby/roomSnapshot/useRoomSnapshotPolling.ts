import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { fetchFriendLeaderboard } from '@/services/friendsService';
import type { FriendLeaderboardResponse, RunningMatchRoom } from '@/lib/api/types';
import { buildActiveRoomRegistryKey } from '@/features/runs/sync/registryKeys';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { startRgPollingInterval } from '@/utils/rgPollingRegistry';
import { armRoomSnapshotPollRetry } from './roomSnapshotPollRetry';
import { useRoomPollingOwnerPolicy } from './useRoomPollingOwnerPolicy';

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
  const hydrateGenerationRef = useRef(0);
  const pollingRoomId = room?.roomId ?? null;
  const pollingLinkedMatchId = room?.linkedMatchId ?? null;
  const pollingRoomState = room?.state ?? null;
  const pollingLinkedMatchStatus = room?.linkedMatchStatus ?? null;
  const policy = useRoomPollingOwnerPolicy({
    linkedMatchId: pollingLinkedMatchId,
    state: pollingRoomState,
    linkedMatchStatus: pollingLinkedMatchStatus,
  });

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
      const hydrateGeneration = hydrateGenerationRef.current + 1;
      hydrateGenerationRef.current = hydrateGeneration;
      setLoading(true);
      try {
        const [nextRoom, friends] = await Promise.all([
          loadRoom(),
          fetchFriendLeaderboard().catch(() => null),
        ]);

        if (cancelled) {
          return null;
        }

        if (friends) {
          setFriendLeaderboard(friends);
        }

        return nextRoom;
      } finally {
        if (hydrateGenerationRef.current === hydrateGeneration) {
          setLoading(false);
        }
      }
    };

    void hydrate();

    const intervalMs = policy.intervalMs;
    const pollingKey = pollingRoomId
      ? `room:${pollingRoomId}:match-room-snapshot`
      : buildActiveRoomRegistryKey(currentUserTag, 'match-room-snapshot');
    const polling = startRgPollingInterval({
      intervalMs,
      key: pollingKey,
      label: 'match-room snapshot polling',
      onTick: loadRoom,
      detail: {
        intervalMs,
        linkedMatchId: pollingLinkedMatchId,
        owner: policy.owner,
        reason: policy.reason,
        roomId: pollingRoomId,
        source: 'match-room snapshot',
        state: pollingRoomState,
      },
    });

    if (!polling.acquired) {
      // Lobby-room poll latch fix (Piece 1a) — a lost acquire is no longer permanently dead: arm
      // the retry seam so the slot is re-attempted every intervalMs, with one catch-up loadRoom on
      // re-acquire. Cleanup stops whichever is live (retry timer or acquired poll handle) on top
      // of the existing teardown.
      const retry = armRoomSnapshotPollRetry({
        detail: {
          intervalMs,
          linkedMatchId: pollingLinkedMatchId,
          owner: policy.owner,
          reason: policy.reason,
          roomId: pollingRoomId,
          source: 'match-room snapshot',
          state: pollingRoomState,
        },
        intervalMs,
        onTick: loadRoom,
        pollingKey,
        roomId: pollingRoomId,
      });
      return () => {
        cancelled = true;
        hydrateGenerationRef.current += 1;
        retry.stop();
        setLoading(false);
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
    return () => {
      cancelled = true;
      hydrateGenerationRef.current += 1;
      polling.stop();
      setLoading(false);
    };
  }, [
    currentUserTag,
    loadRoom,
    policy,
    pollingLinkedMatchId,
    pollingLinkedMatchStatus,
    pollingPaused,
    pollingRoomId,
    pollingRoomState,
    screenFocused,
    setFriendLeaderboard,
    setLoading,
  ]);
}
