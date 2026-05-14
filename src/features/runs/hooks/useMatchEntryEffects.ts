import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import { type Href, router } from 'expo-router';
import type { ScrollView } from 'react-native';
import { getApiErrorMessage, joinRunningMatchRoom } from '@/services';
import type { RunningMatchRoom } from '@/lib/api/types';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { shouldAcceptServerSnapshot } from '@/features/runs/serverClockSync';
import {
  getRunningMatchBlockerFromError,
  runStaleRoomCleanupWithTimeout,
} from '@/features/runs/staleRoomCleanup';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';

type FocusRunningMatchInput = {
  mode: Extract<RunMatchMode, 'duel' | 'group'>;
  matchId?: string;
  distanceKm?: number;
  slotStartAt?: string;
  isTestMatch?: boolean;
  preferArena?: boolean;
};

type UseMatchEntryEffectsInput = {
  focusMatchNonce?: string;
  focusMatchMode?: Extract<RunMatchMode, 'duel' | 'group'>;
  focusMatchId?: string;
  focusMatchDistanceKm?: number;
  focusMatchSlotStartAt?: string;
  focusMatchIsTest?: boolean;
  forceMatchArena?: boolean;
  roomInviteToken?: string;
  livePagerRef: RefObject<ScrollView | null>;
  latestMatchRoomServerNowMsRef: MutableRefObject<number>;
  onForceOpenActiveMatchChange: (value: boolean) => void;
  onLiveArenaPageChange: (page: number) => void;
  onRoomInviteTokenInputChange: (token: string) => void;
  syncServerClock: (serverNow?: string) => void;
  commitMatchRoom: (room: RunningMatchRoom | null) => void;
  onError: (message: string | null) => void;
  focusRunningMatch: (input: FocusRunningMatchInput) => Promise<unknown>;
};

export function useMatchEntryEffects({
  focusMatchNonce,
  focusMatchMode,
  focusMatchId,
  focusMatchDistanceKm,
  focusMatchSlotStartAt,
  focusMatchIsTest,
  forceMatchArena,
  roomInviteToken,
  livePagerRef,
  latestMatchRoomServerNowMsRef,
  onForceOpenActiveMatchChange,
  onLiveArenaPageChange,
  onRoomInviteTokenInputChange,
  syncServerClock,
  commitMatchRoom,
  onError,
  focusRunningMatch,
}: UseMatchEntryEffectsInput) {
  const handledRoomInviteTokenRef = useRef<string | null>(null);
  const handledFocusMatchNonceRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusMatchNonce || !focusMatchMode) {
      return;
    }

    if (handledFocusMatchNonceRef.current === focusMatchNonce) {
      return;
    }

    handledFocusMatchNonceRef.current = focusMatchNonce;

    if (forceMatchArena) {
      onForceOpenActiveMatchChange(true);
      onLiveArenaPageChange(0);
      livePagerRef.current?.scrollTo({ x: 0, animated: false });
    }

    void focusRunningMatch({
      mode: focusMatchMode,
      matchId: focusMatchId,
      distanceKm: focusMatchDistanceKm,
      slotStartAt: focusMatchSlotStartAt,
      isTestMatch: focusMatchIsTest,
      preferArena: Boolean(forceMatchArena),
    }).catch(() => {});
  }, [
    focusMatchDistanceKm,
    focusMatchId,
    focusMatchIsTest,
    focusMatchMode,
    focusMatchNonce,
    focusMatchSlotStartAt,
    focusRunningMatch,
    forceMatchArena,
    livePagerRef,
    onForceOpenActiveMatchChange,
    onLiveArenaPageChange,
  ]);

  useEffect(() => {
    if (!roomInviteToken || handledRoomInviteTokenRef.current === roomInviteToken) {
      return;
    }

    handledRoomInviteTokenRef.current = roomInviteToken;
    onRoomInviteTokenInputChange(roomInviteToken);
    rgPerfMark('invite code input submit', {
      hasToken: true,
      source: 'room invite token effect',
    });

    rgPerfMark('stale cleanup deferred', {
      reason: 'join-first-deeplink',
      source: 'room invite token effect',
    });

    const joinRoom = async (source: string) => {
      const endJoinApiTrace = rgPerfMeasureStart('room join API', {
        inviteTokenLength: roomInviteToken.length,
        source,
      });
      let traceClosed = false;

      try {
        const payload = await joinRunningMatchRoom({ inviteToken: roomInviteToken });

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

    void (async () => {
      try {
        let payload: Awaited<ReturnType<typeof joinRunningMatchRoom>>;
        try {
          payload = await joinRoom('room invite token effect');
        } catch (joinError) {
          const blocker = getRunningMatchBlockerFromError(joinError);
          if (!blocker) {
            throw joinError;
          }

          rgPerfMark('stale cleanup retry after blocker', {
            blocker: blocker.blocker ?? null,
            blockerSource: blocker.blockerSource ?? null,
            source: 'room invite token effect',
          });
          const cleanupOutcome = await runStaleRoomCleanupWithTimeout({
            source: 'room invite token retry after blocker',
          });

          if (cleanupOutcome.status !== 'completed') {
            throw joinError;
          }

          const cleanupPayload = cleanupOutcome.payload;
          if (cleanupPayload.cleaned) {
            commitMatchRoom(cleanupPayload.room);
          }

          if (cleanupPayload.blocker && !cleanupPayload.room) {
            onError(cleanupPayload.message ?? '이미 진행 중인 매칭 상태가 있어요. 기존 상태를 먼저 정리한 뒤 다시 시도해주세요.');
            return;
          }

          if (
            cleanupPayload.room
            && cleanupPayload.room.joined !== false
            && cleanupPayload.room.inviteToken.toUpperCase() === roomInviteToken.toUpperCase()
          ) {
            const endNavigationTrace = rgPerfMeasureStart('navigation to lobby', {
              roomId: cleanupPayload.room.roomId,
              source: 'room invite token existing room',
            });
            router.push('/match-room' as Href);
            endNavigationTrace({ success: true });
            return;
          }

          if (
            cleanupPayload.room
            && cleanupPayload.room.joined !== false
            && cleanupPayload.room.inviteToken.toUpperCase() !== roomInviteToken.toUpperCase()
          ) {
            onError(cleanupPayload.message ?? '이미 참여 중인 방이 있어요. 기존 방을 먼저 나간 뒤 다시 시도해주세요.');
            return;
          }

          payload = await joinRoom('room invite token retry');
        }

        if (!payload.room?.roomId) {
          throw new Error('방 정보를 불러오지 못했습니다. 다시 시도해주세요.');
        }

        if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
          return;
        }

        syncServerClock(payload.serverNow);
        commitMatchRoom(payload.room);

        const endNavigationTrace = rgPerfMeasureStart('navigation to lobby', {
          roomId: payload.room.roomId,
          source: 'room invite token effect',
        });
        router.push('/match-room' as Href);
        endNavigationTrace({ success: true });
      } catch (roomError) {
        rgPerfMark('room join API error', {
          source: 'room invite token effect',
        });
        onError(getApiErrorMessage(roomError, '초대 링크로 방에 들어가지 못했어.'));
      }
    })();
  }, [
    commitMatchRoom,
    latestMatchRoomServerNowMsRef,
    onError,
    onRoomInviteTokenInputChange,
    roomInviteToken,
    syncServerClock,
  ]);
}
