import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { PrepareMatchRoomMutation } from '@/features/runs/runtime/useTrackRunRuntimeStateBridge';
import {
  clearMatchRoomDeletedTombstone,
} from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import { ensureCompetitivePreflight } from '@/features/runs/permissions/ensureCompetitivePreflight';
import { recoverDeletedRoomCreateBlocker } from '@/features/runs/runtime/deletedRoomBlockerPolicy';
import { resolveCreateRoomMaxParticipants } from '@/features/runs/runtime/resolveCreateRoomMaxParticipants';
import {
  getRunningMatchBlockerFromError,
  runStaleRoomCleanupWithTimeout,
} from '@/features/runs/sync/staleRoomCleanup';
import { shouldAcceptServerSnapshot } from '@/features/runs/sync/serverClockSync';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  createRunningMatchRoom,
  getApiErrorMessage,
  leaveRunningMatch,
  leaveRunningMatchRoom,
} from '@/services';
import {
  beginRgInputTrace,
  waitForRgInputFeedbackFrame,
} from '@/utils/rgInputTrace';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';

type NavigateToMatchRoomWithTrace = (
  source: string,
  room?: RunningMatchRoom | null,
  serverNow?: string,
  timingSource?: unknown,
) => void;

type UseTrackRunRoomCreateActionInput = {
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
  setError: Dispatch<SetStateAction<string | null>>;
  setIsCreatingMatchRoom: Dispatch<SetStateAction<boolean>>;
  syncServerClock: (serverNow?: string, timingSource?: unknown) => void;
  visibleMatchRoom: RunningMatchRoom | null;
};

async function leaveBlockerRoomIfPresent(roomId: string | null) {
  if (!roomId) {
    return;
  }

  try {
    // deleteRoom은 절대 보내지 않는다. 이건 사람이 누른 삭제가 아니라 자동 회수 경로라,
    // 방장이 불러도 방을 폭파하면 안 된다 — 남아 있던 참가자가 영문도 모르고 쫓겨난다.
    // 서버는 의사표시 없는 이탈을 '나가기 + 방장 위임'으로 처리한다.
    await leaveRunningMatchRoom({ roomId });
  } catch {
    // Best-effort cleanup before retrying room creation.
  }
}

async function leaveBlockerMatchIfPresent(matchId: string | null) {
  if (!matchId) {
    return;
  }

  try {
    await leaveRunningMatch({ matchId });
  } catch {
    // Best-effort cleanup before retrying room creation.
  }
}

export function useTrackRunRoomCreateAction({
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
  setError,
  setIsCreatingMatchRoom,
  syncServerClock,
  visibleMatchRoom,
}: UseTrackRunRoomCreateActionInput) {
  return useCallback(async () => {
    if (createMatchRoomInFlightRef.current || isCreatingMatchRoom) {
      return;
    }

    // Competitive pre-flight: creating a party room enters a competitive mode, so location
    // "항상 허용" + motion are required first (notifications/battery are soft-requested inside the
    // guard). Gated HERE (not in a press wrapper) so every create caller is covered; the in-flight
    // ref is held across the await so a double-tap can't stack OS permission dialogs. On the pass
    // path the ref is re-set just below, with no await between.
    createMatchRoomInFlightRef.current = true;
    let preflightPassed = false;
    try {
      preflightPassed = await ensureCompetitivePreflight('room create action');
    } finally {
      createMatchRoomInFlightRef.current = false;
    }
    if (!preflightPassed) {
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
          const groupMaxParticipants = resolveCreateRoomMaxParticipants(nextRoomMode, roomMaxParticipants);
          const payload = await createRunningMatchRoom({
            mode: nextRoomMode,
            distanceKm: nextDistanceKm,
            // Party runs are always host-start; the scheduled chooser was removed
            // from the client, but the server still accepts both modes for old rooms.
            startMode: 'host',
            ...(groupMaxParticipants !== undefined ? { maxParticipants: groupMaxParticipants } : {}),
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
        const deletedBlockerRecovery = await recoverDeletedRoomCreateBlocker({
          blocker,
          cleanup: runStaleRoomCleanupWithTimeout,
        });
        if (deletedBlockerRecovery.handled) {
          if (!deletedBlockerRecovery.shouldRetry) {
            throw createError;
          }

          rgPerfMark('room create retry after deleted blocker cleanup', {
            blockerRoomId: deletedBlockerRecovery.blockerRoomId,
            source: 'track-run ready action',
          });
          payload = await createRoom('track-run ready action deleted blocker retry');
        } else {
          rgPerfMark('blocker explicit force-leave attempt', {
            blocker: blocker.blocker ?? null,
            blockerMatchId: blocker.matchId ?? null,
            blockerRoomId: blocker.roomId ?? null,
            blockerSource: blocker.blockerSource ?? null,
            source: 'track-run ready action',
          });
          await leaveBlockerRoomIfPresent(blocker.roomId);
          await leaveBlockerMatchIfPresent(blocker.matchId);
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

      // Re-baseline the shared room-snapshot high-water mark for this fresh room. It is
      // never otherwise reset, so a previous party-run's late timestamp would make this
      // guard drop the new room (and the later countdown-ready ACK that carries the slot
      // start), stranding a device on the arming overlay when a new room is made without a
      // clean exit between runs.
      latestMatchRoomServerNowMsRef.current = 0;
      if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow, payload);
      clearMatchRoomDeletedTombstone(payload.room?.roomId, 'room create');
      commitMatchRoom(payload.room);
      if (payload.room) {
        navigateToMatchRoomWithTrace('room create', payload.room, payload.serverNow, payload);
      }
    } catch (roomError) {
      const message = getApiErrorMessage(roomError, '방을 만들지 못했어요.');
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
    setError,
    setIsCreatingMatchRoom,
    syncServerClock,
    visibleMatchRoom?.roomId,
  ]);
}
