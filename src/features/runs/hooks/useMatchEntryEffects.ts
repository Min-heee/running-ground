import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import { type Href, router } from 'expo-router';
import type { ScrollView } from 'react-native';
import { cleanupStaleRunningMatchRoomState, getApiErrorMessage, joinRunningMatchRoom } from '@/services';
import type { RunningMatchRoom } from '@/lib/api/types';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { shouldAcceptServerSnapshot } from '@/features/runs/serverClockSync';
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

    const endJoinApiTrace = rgPerfMeasureStart('room join API', {
      inviteTokenLength: roomInviteToken.length,
      source: 'room invite token effect',
    });

    void cleanupStaleRunningMatchRoomState()
      .catch(() => null)
      .then((cleanupPayload) => {
        if (cleanupPayload?.cleaned) {
          commitMatchRoom(cleanupPayload.room);
        }

        if (cleanupPayload?.blocker && !cleanupPayload.room) {
          onError(cleanupPayload.message ?? '이미 진행 중인 매칭 상태가 있어요. 기존 상태를 먼저 정리한 뒤 다시 시도해주세요.');
          return null;
        }

        if (
          cleanupPayload?.room
          && cleanupPayload.room.joined !== false
          && cleanupPayload.room.inviteToken.toUpperCase() === roomInviteToken.toUpperCase()
        ) {
          const endNavigationTrace = rgPerfMeasureStart('navigation to lobby', {
            roomId: cleanupPayload.room.roomId,
            source: 'room invite token existing room',
          });
          router.push('/match-room' as Href);
          endNavigationTrace({ success: true });
          return null;
        }

        if (
          cleanupPayload?.room
          && cleanupPayload.room.joined !== false
          && cleanupPayload.room.inviteToken.toUpperCase() !== roomInviteToken.toUpperCase()
        ) {
          onError(cleanupPayload.message ?? '이미 참여 중인 방이 있어요. 기존 방을 먼저 나간 뒤 다시 시도해주세요.');
          return null;
        }

        return joinRunningMatchRoom({ inviteToken: roomInviteToken });
      })
      .then((payload) => {
        if (!payload) {
          endJoinApiTrace({ skipped: true, success: true });
          return;
        }

        if (!payload.room?.roomId) {
          endJoinApiTrace({
            reason: 'missing roomId',
            success: false,
          });
          throw new Error('방 정보를 불러오지 못했습니다. 다시 시도해주세요.');
        }

        endJoinApiTrace({
          roomId: payload.room.roomId,
          success: true,
        });
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
      })
      .catch((roomError) => {
        endJoinApiTrace({ success: false });
        rgPerfMark('room join API error', {
          source: 'room invite token effect',
        });
        onError(getApiErrorMessage(roomError, '초대 링크로 방에 들어가지 못했어.'));
      });
  }, [
    commitMatchRoom,
    latestMatchRoomServerNowMsRef,
    onError,
    onRoomInviteTokenInputChange,
    roomInviteToken,
    syncServerClock,
  ]);
}
