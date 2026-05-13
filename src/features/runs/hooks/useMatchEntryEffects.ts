import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import { type Href, router } from 'expo-router';
import type { ScrollView } from 'react-native';
import { getApiErrorMessage, joinRunningMatchRoom } from '@/services';
import type { RunningMatchRoom } from '@/lib/api/types';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { shouldAcceptServerSnapshot } from '@/features/runs/serverClockSync';

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

    void joinRunningMatchRoom({ inviteToken: roomInviteToken })
      .then((payload) => {
        if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
          return;
        }

        syncServerClock(payload.serverNow);
        commitMatchRoom(payload.room);

        if (payload.room) {
          router.push('/match-room' as Href);
        }
      })
      .catch((roomError) => {
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
