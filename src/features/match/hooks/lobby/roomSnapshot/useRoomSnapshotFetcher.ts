import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import { getApiErrorMessage } from '@/services/apiError';
import { runActiveRoomCheck } from '@/features/runs/sync/activeRoomCheck';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import { isRgInputInteractionRecent } from '@/utils/rgInputTrace';
import { getInviteInboxDebounceMs } from './roomSnapshotPollingPolicy';

type ActiveRoomCheckResult = Awaited<ReturnType<typeof runActiveRoomCheck>>;

export function useRoomSnapshotFetcher({
  buildRouteKey,
  handleActiveRoomSnapshotResult,
  lastInviteInboxPollStartedAtRef,
  mountedRef,
  pollingPausedRef,
  recipientUserId,
  roomRef,
  screenFocusedRef,
  setError,
}: {
  buildRouteKey: () => string;
  handleActiveRoomSnapshotResult: (activeRoomCheckResult: ActiveRoomCheckResult) => Promise<RunningMatchRoom | null>;
  lastInviteInboxPollStartedAtRef: MutableRefObject<number>;
  mountedRef: MutableRefObject<boolean>;
  pollingPausedRef: MutableRefObject<boolean>;
  recipientUserId: string;
  roomRef: MutableRefObject<RunningMatchRoom | null>;
  screenFocusedRef: MutableRefObject<boolean>;
  setError: Dispatch<SetStateAction<string | null>>;
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
    rgPerfMark('invite inbox fetch for recipient begin', {
      routeKey,
      source: 'match-room snapshot',
      userId: recipientUserId,
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
      rgPerfMark('invite inbox fetch for recipient end', {
        requestId: activeRoomCheckResult.requestId,
        roomId: activeRoomCheckResult.payload?.room?.roomId ?? null,
        routeKey,
        source: 'match-room snapshot',
        success: true,
        userId: recipientUserId,
      });

      return handleActiveRoomSnapshotResult(activeRoomCheckResult);
    } catch (roomError) {
      endInviteInboxPollingTrace({
        success: false,
      });
      rgPerfMark('invite inbox fetch for recipient end', {
        message: getApiErrorMessage(roomError, '대기실을 불러오지 못했어.'),
        routeKey,
        source: 'match-room snapshot',
        success: false,
        userId: recipientUserId,
      });
      if (!mountedRef.current || pollingPausedRef.current) {
        return null;
      }

      setError(getApiErrorMessage(roomError, '대기실을 불러오지 못했어.'));
      return null;
    }
  }, [
    buildRouteKey,
    handleActiveRoomSnapshotResult,
    lastInviteInboxPollStartedAtRef,
    mountedRef,
    pollingPausedRef,
    recipientUserId,
    roomRef,
    screenFocusedRef,
    setError,
  ]);
}
