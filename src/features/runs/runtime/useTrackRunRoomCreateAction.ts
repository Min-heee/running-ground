import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { RoomStartMode } from '@/features/runs/hooks/usePartyRunRoom';
import type { PrepareMatchRoomMutation } from '@/features/runs/runtime/useTrackRunRuntimeStateBridge';
import {
  clearMatchRoomDeletedTombstone,
  isMatchRoomDeleted,
} from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import {
  getRunningMatchBlockerFromError,
  runStaleRoomCleanupWithTimeout,
} from '@/features/runs/sync/staleRoomCleanup';
import { shouldAcceptServerSnapshot } from '@/features/runs/sync/serverClockSync';
import type { RunningMatchRoom } from '@/lib/api/types';
import { createRunningMatchRoom, getApiErrorMessage } from '@/services';
import {
  beginRgInputTrace,
  waitForRgInputFeedbackFrame,
} from '@/utils/rgInputTrace';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';

type NavigateToMatchRoomWithTrace = (
  source: string,
  room?: RunningMatchRoom | null,
  serverNow?: string,
) => void;

type UseTrackRunRoomCreateActionInput = {
  activeDuelSlotStartAt: string;
  activeGroupSlotStartAt: string;
  commitMatchRoom: (room: RunningMatchRoom | null) => void;
  createMatchRoomInFlightRef: MutableRefObject<boolean>;
  duelDistanceKm: number;
  groupDistanceKm: number;
  isCreatingMatchRoom: boolean;
  latestMatchRoomServerNowMsRef: MutableRefObject<number>;
  matchRoom: RunningMatchRoom | null;
  navigateToMatchRoomWithTrace: NavigateToMatchRoomWithTrace;
  prepareMatchRoomMutation: PrepareMatchRoomMutation;
  roomMatchMode: Extract<RunMatchMode, 'duel' | 'group'>;
  roomMaxParticipants: string;
  roomStartMode: RoomStartMode;
  setError: Dispatch<SetStateAction<string | null>>;
  setIsCreatingMatchRoom: Dispatch<SetStateAction<boolean>>;
  syncServerClock: (serverNow?: string) => void;
  visibleMatchRoom: RunningMatchRoom | null;
};

export function useTrackRunRoomCreateAction({
  activeDuelSlotStartAt,
  activeGroupSlotStartAt,
  commitMatchRoom,
  createMatchRoomInFlightRef,
  duelDistanceKm,
  groupDistanceKm,
  isCreatingMatchRoom,
  latestMatchRoomServerNowMsRef,
  matchRoom,
  navigateToMatchRoomWithTrace,
  prepareMatchRoomMutation,
  roomMatchMode,
  roomMaxParticipants,
  roomStartMode,
  setError,
  setIsCreatingMatchRoom,
  syncServerClock,
  visibleMatchRoom,
}: UseTrackRunRoomCreateActionInput) {
  return useCallback(async () => {
    if (createMatchRoomInFlightRef.current || isCreatingMatchRoom) {
      return;
    }

    const nextRoomMode = roomMatchMode;
    const nextDistanceKm = nextRoomMode === 'duel' ? duelDistanceKm : groupDistanceKm;
    const inputTrace = beginRgInputTrace('room create button press', {
      distanceKm: nextDistanceKm,
      mode: nextRoomMode,
      source: 'track-run ready action',
    });

    rgPerfMark('room create button press', {
      distanceKm: nextDistanceKm,
      mode: nextRoomMode,
      source: 'track-run ready action',
    });

    createMatchRoomInFlightRef.current = true;
    setIsCreatingMatchRoom(true);
    setError(null);
    inputTrace.markFeedback('loading state set', {
      disabled: true,
      loading: true,
    });
    inputTrace.markFeedbackCommitted({
      disabled: true,
      loading: true,
    });
    await waitForRgInputFeedbackFrame();
    inputTrace.markApiStarted({
      source: 'room create preflight',
    });

    try {
      if (!matchRoom?.roomId && !visibleMatchRoom?.roomId) {
        rgPerfMark('stale cleanup skipped no blocker', {
          mode: nextRoomMode,
          source: 'room create preflight',
        });
      }

      const canProceed = await prepareMatchRoomMutation({
        source: 'room create preflight',
      });
      if (!canProceed) {
        return;
      }

      const createRoom = async (source: string) => {
        const endCreateApiTrace = rgPerfMeasureStart('room create API', {
          distanceKm: nextDistanceKm,
          mode: nextRoomMode,
          source,
        });
        try {
          const payload = await createRunningMatchRoom({
            mode: nextRoomMode,
            distanceKm: nextDistanceKm,
            startMode: roomStartMode,
            ...(roomStartMode === 'scheduled'
              ? { slotStartAt: nextRoomMode === 'duel' ? activeDuelSlotStartAt : activeGroupSlotStartAt }
              : {}),
            ...(nextRoomMode === 'group' ? { maxParticipants: Number(roomMaxParticipants) || 10 } : {}),
          });
          endCreateApiTrace({
            roomId: payload.room?.roomId ?? null,
            success: true,
          });
          return payload;
        } catch (error) {
          endCreateApiTrace({ success: false });
          throw error;
        }
      };

      let payload: Awaited<ReturnType<typeof createRunningMatchRoom>>;
      try {
        payload = await createRoom('track-run ready action');
      } catch (createError) {
        const blocker = getRunningMatchBlockerFromError(createError);
        if (!blocker) {
          throw createError;
        }

        rgPerfMark('room create blocker detected', {
          blocker: blocker.blocker ?? null,
          blockerRoomId: blocker.roomId ?? null,
          blockerSource: blocker.blockerSource ?? null,
          source: 'track-run ready action',
        });
        if (isMatchRoomDeleted(blocker.roomId)) {
          rgPerfMark('room create blocker ignored deleted room', {
            blocker: blocker.blocker ?? null,
            blockerRoomId: blocker.roomId ?? null,
            blockerSource: blocker.blockerSource ?? null,
            source: 'track-run ready action',
          });
          rgPerfMark('room delete active blocker cleanup begin', {
            blocker: blocker.blocker ?? null,
            blockerRoomId: blocker.roomId ?? null,
            blockerSource: blocker.blockerSource ?? null,
            source: 'room create deleted blocker recovery',
          });
          const cleanupOutcome = await runStaleRoomCleanupWithTimeout({
            source: 'room create deleted blocker recovery',
          });
          rgPerfMark('room delete active blocker cleanup end', {
            blockerRoomId: blocker.roomId ?? null,
            cleaned: cleanupOutcome.status === 'completed' ? cleanupOutcome.payload.cleaned : null,
            status: cleanupOutcome.status,
            source: 'room create deleted blocker recovery',
          });
          if (cleanupOutcome.status !== 'completed') {
            throw createError;
          }

          rgPerfMark('room create retry after deleted blocker cleanup', {
            blockerRoomId: blocker.roomId ?? null,
            source: 'track-run ready action',
          });
          payload = await createRoom('track-run ready action deleted blocker retry');
        } else {
          rgPerfMark('stale cleanup retry after blocker', {
            blocker: blocker.blocker ?? null,
            blockerSource: blocker.blockerSource ?? null,
            source: 'track-run ready action',
          });
          const canRetry = await prepareMatchRoomMutation({
            forceCleanup: true,
            source: 'room create retry after blocker',
          });
          if (!canRetry) {
            throw createError;
          }
          payload = await createRoom('track-run ready action retry');
        }
      }

      if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow);
      clearMatchRoomDeletedTombstone(payload.room?.roomId, 'room create');
      commitMatchRoom(payload.room);
      if (payload.room) {
        navigateToMatchRoomWithTrace('room create', payload.room, payload.serverNow);
      }
    } catch (roomError) {
      const message = getApiErrorMessage(roomError, '방을 만들지 못했어.');
      rgPerfMark('room create API error', {
        message,
        mode: nextRoomMode,
        source: 'track-run ready action',
      });
      setError(message);
    } finally {
      createMatchRoomInFlightRef.current = false;
      setIsCreatingMatchRoom(false);
    }
  }, [
    activeDuelSlotStartAt,
    activeGroupSlotStartAt,
    commitMatchRoom,
    createMatchRoomInFlightRef,
    duelDistanceKm,
    groupDistanceKm,
    isCreatingMatchRoom,
    latestMatchRoomServerNowMsRef,
    matchRoom?.roomId,
    navigateToMatchRoomWithTrace,
    prepareMatchRoomMutation,
    roomMatchMode,
    roomMaxParticipants,
    roomStartMode,
    setError,
    setIsCreatingMatchRoom,
    syncServerClock,
    visibleMatchRoom?.roomId,
  ]);
}
