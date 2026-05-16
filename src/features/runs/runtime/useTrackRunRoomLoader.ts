import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  getActiveRoomCheckResultSkipReason,
  runActiveRoomCheck,
} from '@/features/runs/sync/activeRoomCheck';
import { isMatchRoomDeleted } from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import {
  buildActiveRoomResultLogDetail,
  buildActiveRoomSnapshotKey,
} from '@/features/runs/sync/activeRoomResult';
import { shouldAcceptServerSnapshot } from '@/features/runs/sync/serverClockSync';
import type { RunningMatchRoom } from '@/lib/api/types';
import { isRgInputInteractionRecent } from '@/utils/rgInputTrace';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import { getTrackRunActiveRoomCheckLiveSkipReason } from './trackRunActiveRoomCheckPolicy';

type LiveMatchMountedRef = MutableRefObject<{
  matchId: string | null;
  mode: Extract<RunMatchMode, 'duel' | 'group'>;
  mountedAtMs: number;
} | null>;

type LiveMatchShellPreservation = {
  key: string | null;
  shouldRenderLiveArena: boolean;
};

type LoadMatchRoomOptions = {
  ignoreDuringInteraction?: boolean;
  localActiveMatchId?: string | null;
  localActiveRoomId?: string | null;
  priority?: 'normal' | 'low-priority';
  requireLocalActiveHint?: boolean;
};

type UseTrackRunRoomLoaderInput = {
  buildTrackRunActiveRoomCheckRouteKey: () => string;
  commitMatchRoom: (room: RunningMatchRoom | null) => void;
  currentUserId: string;
  forfeitedMatchIdsRef: MutableRefObject<Set<string>>;
  getCurrentLiveMatchId: () => string | null;
  isExitingRoom: (roomId?: string | null) => boolean;
  isMountedRef: MutableRefObject<boolean>;
  lastHandledActiveRoomSnapshotKeyRef: MutableRefObject<string | null>;
  latestMatchRoomServerNowMsRef: MutableRefObject<number>;
  liveMatchMountedRef: LiveMatchMountedRef;
  liveMatchRenderIdentity: string | null;
  liveMatchRenderMode: Extract<RunMatchMode, 'duel' | 'group'> | null;
  liveMatchShellPreservation: LiveMatchShellPreservation;
  matchRoom: RunningMatchRoom | null;
  syncServerClock: (serverNow?: string) => void;
};

export function useTrackRunRoomLoader({
  buildTrackRunActiveRoomCheckRouteKey,
  commitMatchRoom,
  currentUserId,
  forfeitedMatchIdsRef,
  getCurrentLiveMatchId,
  isExitingRoom,
  isMountedRef,
  lastHandledActiveRoomSnapshotKeyRef,
  latestMatchRoomServerNowMsRef,
  liveMatchMountedRef,
  liveMatchRenderIdentity,
  liveMatchRenderMode,
  liveMatchShellPreservation,
  matchRoom,
  syncServerClock,
}: UseTrackRunRoomLoaderInput) {
  return useCallback(async (options?: LoadMatchRoomOptions) => {
    const routeKey = buildTrackRunActiveRoomCheckRouteKey();
    const priority = options?.priority ?? 'normal';
    const localActiveMatchId = options?.localActiveMatchId ?? null;
    const localActiveRoomId = options?.localActiveRoomId ?? null;
    const liveSkipReason = getTrackRunActiveRoomCheckLiveSkipReason({
      linkedMatchId: matchRoom?.linkedMatchId ?? null,
      liveMatchKey: liveMatchShellPreservation.key,
      liveMatchMounted: Boolean(liveMatchMountedRef.current),
    });

    if (liveSkipReason) {
      rgPerfMark('active room check skipped live match mounted', {
        linkedMatchId: matchRoom?.linkedMatchId ?? null,
        liveMatchKey: liveMatchShellPreservation.key,
        matchId: liveMatchRenderIdentity,
        priority,
        reason: liveSkipReason,
        routeKey,
        source: 'track-run experience',
      });
      return matchRoom;
    }

    if (options?.requireLocalActiveHint && !localActiveRoomId && !localActiveMatchId) {
      rgPerfMark('active room check skipped no local active hint', {
        priority,
        routeKey,
        source: 'track-run experience',
      });
      return matchRoom;
    }

    if (options?.ignoreDuringInteraction && isRgInputInteractionRecent()) {
      rgPerfMark('active room check skipped during interaction', {
        priority,
        routeKey,
        source: 'track-run experience',
      });
      rgPerfMark('active room check suppressed by user interaction', {
        priority,
        routeKey,
        source: 'track-run experience',
      });
      return matchRoom;
    }

    if (priority === 'low-priority') {
      rgPerfMark('active room check low priority idle', {
        routeKey,
        source: 'track-run experience',
      });
    }

    const activeRoomCheckResult = await runActiveRoomCheck({
      ...(priority === 'low-priority'
        ? {
            hardTimeoutMs: 1_500,
            throttleMs: 60_000,
            uiTimeoutMs: 1_200,
          }
        : {}),
      routeKey,
      source: 'track-run experience',
    });

    if (options?.ignoreDuringInteraction && isRgInputInteractionRecent()) {
      rgPerfMark('active room check skipped during interaction', {
        priority,
        reason: 'result-after-input',
        requestId: activeRoomCheckResult.requestId,
        routeKey,
        source: 'track-run experience',
      });
      rgPerfMark('active room check suppressed by user interaction', {
        priority,
        reason: 'result-after-input',
        requestId: activeRoomCheckResult.requestId,
        routeKey,
        source: 'track-run experience',
      });
      return matchRoom;
    }

    const currentRouteKey = buildTrackRunActiveRoomCheckRouteKey();
    const skipReason = getActiveRoomCheckResultSkipReason({
      currentMatchId: getCurrentLiveMatchId(),
      currentRouteKey,
      isLiveMatchMounted: Boolean(liveMatchMountedRef.current),
      result: activeRoomCheckResult,
    });

    if (skipReason) {
      const logDetail = {
        currentRouteKey,
        generation: activeRoomCheckResult.generation,
        reason: skipReason,
        requestId: activeRoomCheckResult.requestId,
        routeKey: activeRoomCheckResult.routeKey,
        source: 'track-run experience',
      };

      if (skipReason === 'stale-generation') {
        rgPerfMark('active room result skipped stale generation', logDetail);
      } else if (skipReason === 'live-match-mounted') {
        rgPerfMark('active room result ignored after live match mounted', logDetail);
      } else {
        rgPerfMark('active room result skipped duplicate', logDetail);
      }
      if (liveMatchShellPreservation.shouldRenderLiveArena) {
        rgPerfMark('stale result ignored without unmount', {
          ...logDetail,
          liveMatchKey: liveMatchShellPreservation.key,
          matchId: liveMatchRenderIdentity,
          mode: liveMatchRenderMode,
        });
      }
      return matchRoom;
    }

    const payload = activeRoomCheckResult.payload;
    if (!payload) {
      return matchRoom;
    }

    if (!isMountedRef.current) {
      rgPerfMark('active room result skipped duplicate', {
        reason: 'unmounted',
        source: 'track-run experience',
      });
      return matchRoom;
    }

    if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
      rgPerfMark('active room result skipped duplicate', {
        reason: 'stale result',
        source: 'track-run experience',
      });
      if (liveMatchShellPreservation.shouldRenderLiveArena) {
        rgPerfMark('stale result ignored without unmount', {
          liveMatchKey: liveMatchShellPreservation.key,
          matchId: liveMatchRenderIdentity,
          mode: liveMatchRenderMode,
          reason: 'stale result',
          source: 'track-run experience',
        });
      }
      return matchRoom;
    }

    if (isMatchRoomDeleted(payload.room?.roomId)) {
      rgPerfMark('active room result ignored deleted room', {
        roomId: payload.room?.roomId ?? null,
        source: 'track-run experience',
        state: payload.room?.state ?? null,
      });
      commitMatchRoom(null);
      return null;
    }

    if (isExitingRoom(payload.room?.roomId)) {
      const endStaleCleanupTrace = rgPerfMeasureStart('stale room cleanup', {
        roomId: payload.room?.roomId ?? null,
        source: 'track-run exit guard',
      });
      commitMatchRoom(null);
      endStaleCleanupTrace({ success: true });
      return null;
    }

    if (payload.room?.linkedMatchId && forfeitedMatchIdsRef.current.has(payload.room.linkedMatchId)) {
      const endStaleCleanupTrace = rgPerfMeasureStart('stale room cleanup', {
        linkedMatchId: payload.room.linkedMatchId,
        roomId: payload.room.roomId,
        source: 'track-run forfeited match guard',
      });
      commitMatchRoom(null);
      endStaleCleanupTrace({ success: true });
      return null;
    }

    const snapshotKey = buildActiveRoomSnapshotKey({
      room: payload.room,
      userId: currentUserId,
    });
    if (lastHandledActiveRoomSnapshotKeyRef.current === snapshotKey) {
      rgPerfMark('active room result skipped duplicate', buildActiveRoomResultLogDetail({
        reason: 'same room snapshot',
        room: payload.room,
        snapshotKey,
        source: 'track-run experience',
      }));
      return matchRoom;
    }

    lastHandledActiveRoomSnapshotKeyRef.current = snapshotKey;
    rgPerfMark('active room result handled', buildActiveRoomResultLogDetail({
      room: payload.room,
      snapshotKey,
      source: 'track-run experience',
    }));

    syncServerClock(payload.serverNow);
    if (payload.room) {
      rgPerfMark('already joined room detected', {
        roomId: payload.room.roomId,
        source: 'track-run experience',
        state: payload.room.state,
      });
      if (payload.room.linkedMatchId) {
        rgPerfMark('track-run live state accepted hydration', {
          matchId: payload.room.linkedMatchId,
          roomId: payload.room.roomId,
          source: 'track-run experience',
          state: payload.room.state,
        });
      }
    }

    const nextRoom = payload.room;
    commitMatchRoom(nextRoom);
    return nextRoom;
  }, [
    buildTrackRunActiveRoomCheckRouteKey,
    commitMatchRoom,
    currentUserId,
    forfeitedMatchIdsRef,
    getCurrentLiveMatchId,
    isExitingRoom,
    isMountedRef,
    lastHandledActiveRoomSnapshotKeyRef,
    latestMatchRoomServerNowMsRef,
    liveMatchMountedRef,
    liveMatchRenderIdentity,
    liveMatchRenderMode,
    liveMatchShellPreservation.key,
    liveMatchShellPreservation.shouldRenderLiveArena,
    matchRoom,
    syncServerClock,
  ]);
}
