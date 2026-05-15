import { useCallback, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { PrepareMatchRoomMutation } from '@/features/runs/runtime/useTrackRunRuntimeStateBridge';
import {
  MANUAL_INVITE_CODE_JOIN_SOURCE,
  startManualInviteJoinSingleFlight,
  type ManualInviteJoinSingleFlightState,
} from '@/features/runs/sync/manualInviteJoin';
import { getRunningMatchBlockerFromError } from '@/features/runs/sync/staleRoomCleanup';
import { shouldAcceptServerSnapshot } from '@/features/runs/sync/serverClockSync';
import type { RunningMatchRoom } from '@/lib/api/types';
import { getApiErrorMessage, joinRunningMatchRoom } from '@/services';
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

type UseTrackRunRoomJoinActionInput = {
  commitMatchRoom: (room: RunningMatchRoom | null) => void;
  isJoiningMatchRoom: boolean;
  joinMatchRoomInFlightRef: MutableRefObject<boolean>;
  latestMatchRoomServerNowMsRef: MutableRefObject<number>;
  matchRoom: RunningMatchRoom | null;
  navigateToMatchRoomWithTrace: NavigateToMatchRoomWithTrace;
  prepareMatchRoomMutation: PrepareMatchRoomMutation;
  roomInviteTokenInput: string;
  setError: Dispatch<SetStateAction<string | null>>;
  setIsJoiningMatchRoom: Dispatch<SetStateAction<boolean>>;
  setRoomInviteTokenInput: Dispatch<SetStateAction<string>>;
  syncServerClock: (serverNow?: string) => void;
  visibleMatchRoom: RunningMatchRoom | null;
};

export function useTrackRunRoomJoinAction({
  commitMatchRoom,
  isJoiningMatchRoom,
  joinMatchRoomInFlightRef,
  latestMatchRoomServerNowMsRef,
  matchRoom,
  navigateToMatchRoomWithTrace,
  prepareMatchRoomMutation,
  roomInviteTokenInput,
  setError,
  setIsJoiningMatchRoom,
  setRoomInviteTokenInput,
  syncServerClock,
  visibleMatchRoom,
}: UseTrackRunRoomJoinActionInput) {
  const joinSingleFlightRef = useRef<ManualInviteJoinSingleFlightState>(null);

  return useCallback(() => {
    const inviteToken = roomInviteTokenInput.trim();

    if (!inviteToken) {
      rgPerfMark('room join API error', {
        reason: 'missing invite token',
        source: MANUAL_INVITE_CODE_JOIN_SOURCE,
      });
      setError('방 초대 코드를 입력해줘.');
      return Promise.resolve();
    }

    const joinStart = startManualInviteJoinSingleFlight(joinSingleFlightRef, {
      inviteToken,
      isJoining: joinMatchRoomInFlightRef.current || isJoiningMatchRoom,
      run: async () => {
        const inputTrace = beginRgInputTrace('invite code input submit', {
          hasToken: true,
          source: MANUAL_INVITE_CODE_JOIN_SOURCE,
        });

        rgPerfMark('invite code input submit', {
          hasToken: true,
          source: MANUAL_INVITE_CODE_JOIN_SOURCE,
        });

        joinMatchRoomInFlightRef.current = true;
        setIsJoiningMatchRoom(true);
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
          source: 'invite code join preflight',
        });

        try {
          if (!matchRoom?.roomId && !visibleMatchRoom?.roomId) {
            rgPerfMark('stale cleanup deferred', {
              reason: 'join-first-no-local-blocker',
              source: 'invite code join preflight',
            });
          }

          const preflightStartedAt = Date.now();
          const canProceed = await prepareMatchRoomMutation({
            inviteToken,
            source: 'invite code join preflight',
          });
          rgPerfMark('room join preflight duration', {
            canProceed,
            durationMs: Date.now() - preflightStartedAt,
            inviteTokenLength: inviteToken.length,
            source: 'invite code join preflight',
          });
          if (!canProceed) {
            return;
          }

          const joinRoom = async (source: string) => {
            const endJoinApiTrace = rgPerfMeasureStart('room join API', {
              inviteTokenLength: inviteToken.length,
              source,
            });
            let traceClosed = false;
            const networkStartedAt = Date.now();
            try {
              const payload = await joinRunningMatchRoom({ inviteToken });
              const networkDurationMs = Date.now() - networkStartedAt;
              rgPerfMark('room join network duration', {
                durationMs: networkDurationMs,
                inviteTokenLength: inviteToken.length,
                roomId: payload.room?.roomId ?? null,
                serverNow: payload.serverNow ?? null,
                source,
              });
              if (networkDurationMs >= 5000) {
                rgPerfMark('room join slow server response', {
                  durationMs: networkDurationMs,
                  inviteTokenLength: inviteToken.length,
                  roomId: payload.room?.roomId ?? null,
                  source,
                });
              }
              if (!payload.room?.roomId) {
                endJoinApiTrace({
                  reason: 'missing roomId',
                  success: false,
                });
                traceClosed = true;
                throw new Error('방 정보를 불러오지 못했습니다. 다시 시도해주세요.');
              }
              endJoinApiTrace({
                roomId: payload.room.roomId,
                success: true,
              });
              return payload;
            } catch (error) {
              if (!traceClosed) {
                endJoinApiTrace({ success: false });
              }
              throw error;
            }
          };

          let payload: Awaited<ReturnType<typeof joinRunningMatchRoom>>;
          try {
            payload = await joinRoom(MANUAL_INVITE_CODE_JOIN_SOURCE);
          } catch (joinError) {
            const blocker = getRunningMatchBlockerFromError(joinError);
            if (!blocker) {
              throw joinError;
            }

            rgPerfMark('stale cleanup retry after blocker', {
              blocker: blocker.blocker ?? null,
              blockerSource: blocker.blockerSource ?? null,
              source: MANUAL_INVITE_CODE_JOIN_SOURCE,
            });
            const retryPreflightStartedAt = Date.now();
            const canRetry = await prepareMatchRoomMutation({
              forceCleanup: true,
              inviteToken,
              source: 'invite code join retry after blocker',
            });
            rgPerfMark('room join preflight duration', {
              canProceed: canRetry,
              durationMs: Date.now() - retryPreflightStartedAt,
              inviteTokenLength: inviteToken.length,
              source: 'invite code join retry after blocker',
            });
            if (!canRetry) {
              throw joinError;
            }
            payload = await joinRoom('manual invite code retry');
          }

          if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
            return;
          }

          rgPerfMark('room join hydration begin', {
            inviteTokenLength: inviteToken.length,
            roomId: payload.room.roomId,
            source: MANUAL_INVITE_CODE_JOIN_SOURCE,
          });
          syncServerClock(payload.serverNow);
          commitMatchRoom(payload.room);
          setRoomInviteTokenInput('');
          navigateToMatchRoomWithTrace('invite code join', payload.room, payload.serverNow);
          rgPerfMark('room join hydration end', {
            inviteTokenLength: inviteToken.length,
            roomId: payload.room.roomId,
            source: MANUAL_INVITE_CODE_JOIN_SOURCE,
          });
        } catch (roomError) {
          const message = getApiErrorMessage(roomError, '방에 들어가지 못했어.');
          rgPerfMark('room join API error', {
            message,
            source: MANUAL_INVITE_CODE_JOIN_SOURCE,
          });
          setError(message);
        } finally {
          joinMatchRoomInFlightRef.current = false;
          setIsJoiningMatchRoom(false);
        }
      },
    });

    if (joinStart.status !== 'started') {
      rgPerfMark('invite code submit skipped duplicate', {
        hasToken: true,
        inviteTokenLength: inviteToken.length,
        reason: joinStart.reason,
        source: MANUAL_INVITE_CODE_JOIN_SOURCE,
      });

      if (joinStart.status === 'reused') {
        rgPerfMark('room join single-flight reused', {
          inviteTokenLength: inviteToken.length,
          source: MANUAL_INVITE_CODE_JOIN_SOURCE,
        });
      }
    }

    return joinStart.promise;
  }, [
    commitMatchRoom,
    isJoiningMatchRoom,
    joinMatchRoomInFlightRef,
    latestMatchRoomServerNowMsRef,
    matchRoom?.roomId,
    navigateToMatchRoomWithTrace,
    prepareMatchRoomMutation,
    roomInviteTokenInput,
    setError,
    setIsJoiningMatchRoom,
    setRoomInviteTokenInput,
    syncServerClock,
    visibleMatchRoom?.roomId,
  ]);
}
