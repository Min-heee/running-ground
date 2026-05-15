import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import { getApiErrorMessage } from '@/services/apiError';
import { runActiveRoomCheck } from '@/features/runs/sync/activeRoomCheck';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import { isRgInputInteractionRecent } from '@/utils/rgInputTrace';
import { getInviteInboxDebounceMs } from './roomSnapshotPollingPolicy';
import { handleMatchRoomActiveRoomResult } from './activeRoomResultHandler';

export function useRoomSnapshotFetcher({
  buildRouteKey,
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
}: {
  buildRouteKey: () => string;
  commitRoom: (nextRoom: RunningMatchRoom | null) => void;
  currentUserTag: string;
  lastDisplayedInviteKeyRef: MutableRefObject<string | null>;
  lastHandledActiveRoomSnapshotKeyRef: MutableRefObject<string | null>;
  lastInviteInboxPollStartedAtRef: MutableRefObject<number>;
  latestRoomServerNowMsRef: MutableRefObject<number>;
  liveMatchHandoffRef: MutableRefObject<{ matchId: string; roomId: string } | null>;
  markLiveMatchHandoff: (nextRoom: RunningMatchRoom, source: string) => void;
  mountedRef: MutableRefObject<boolean>;
  pollingPausedRef: MutableRefObject<boolean>;
  roomRef: MutableRefObject<RunningMatchRoom | null>;
  screenFocusedRef: MutableRefObject<boolean>;
  setError: Dispatch<SetStateAction<string | null>>;
  syncServerClock: (serverNow?: string) => void;
}) {
  return useCallback(async () => {
    if (pollingPausedRef.current || !screenFocusedRef.current) {
      rgPerfMark('invite inbox polling skipped idle', {
        paused: pollingPausedRef.current,
        source: 'match-room snapshot',
        focused: screenFocusedRef.current,
      });
      return null;
    }

    const routeKey = buildRouteKey();
    if (isRgInputInteractionRecent()) {
      rgPerfMark('active room check suppressed by user interaction', {
        routeKey,
        source: 'match-room snapshot',
      });
      return roomRef.current;
    }

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

      return handleMatchRoomActiveRoomResult({
        activeRoomCheckResult,
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
      });
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
  }, [
    buildRouteKey,
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
  ]);
}
