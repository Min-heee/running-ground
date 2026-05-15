import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';
import { isMatchRoomExiting } from '@/features/runs/lifecycle/matchRoomExitGuard';
import { buildTrackRunRuntimeRouteKey } from '@/features/runs/lifecycle/trackRunRouteState';
import { runStaleRoomCleanupWithTimeout } from '@/features/runs/sync/staleRoomCleanup';
import type { RunningMatchRoom } from '@/lib/api/types';
import { rgPerfMark } from '@/utils/rgPerfTrace';

export type PrepareMatchRoomMutation = (input: {
  forceCleanup?: boolean;
  inviteToken?: string;
  source: string;
}) => Promise<boolean>;

type NavigateToMatchRoomWithTrace = (
  source: string,
  room?: RunningMatchRoom | null,
  serverNow?: string,
) => void;

type UseTrackRunRuntimeStateBridgeInput = {
  commitMatchRoom: (room: RunningMatchRoom | null) => void;
  focusMatchId?: string;
  focusRoomId?: string;
  focusedDuelMatchIdRef: MutableRefObject<string | null>;
  focusedGroupMatchIdRef: MutableRefObject<string | null>;
  forceOpenActiveMatch: boolean;
  hydratedMatchId?: string | null;
  hydratedMatchMode?: Extract<RunMatchMode, 'duel' | 'group'>;
  hydratedRoomId?: string | null;
  lastRouteKeyCorrectionRef: MutableRefObject<string | null>;
  liveArenaPage: number;
  matchMode: RunMatchMode;
  matchRoom: RunningMatchRoom | null;
  navigateToMatchRoomWithTrace: NavigateToMatchRoomWithTrace;
  roomLinkedMatchContext: PartyRunLinkedMatchContext | null;
  setError: Dispatch<SetStateAction<string | null>>;
  setSelectedRoomFriendIds: Dispatch<SetStateAction<string[]>>;
  visibleMatchRoom: RunningMatchRoom | null;
};

export function useTrackRunRuntimeStateBridge({
  commitMatchRoom,
  focusMatchId,
  focusRoomId,
  focusedDuelMatchIdRef,
  focusedGroupMatchIdRef,
  forceOpenActiveMatch,
  hydratedMatchId,
  hydratedMatchMode,
  hydratedRoomId,
  lastRouteKeyCorrectionRef,
  liveArenaPage,
  matchMode,
  matchRoom,
  navigateToMatchRoomWithTrace,
  roomLinkedMatchContext,
  setError,
  setSelectedRoomFriendIds,
  visibleMatchRoom,
}: UseTrackRunRuntimeStateBridgeInput) {
  const buildTrackRunActiveRoomCheckRouteKey = useCallback(() => {
    const routeState = buildTrackRunRuntimeRouteKey({
      focusMatchId,
      focusRoomId,
      focusedDuelMatchId: focusedDuelMatchIdRef.current,
      focusedGroupMatchId: focusedGroupMatchIdRef.current,
      forceOpenActiveMatch,
      hydratedMatchId,
      hydratedMatchMode,
      hydratedRoomId,
      liveArenaPage,
      matchMode,
      matchRoomId: matchRoom?.roomId,
      roomLinkedMatchId: roomLinkedMatchContext?.matchId,
      visibleMatchRoomId: visibleMatchRoom?.roomId,
    });

    if (routeState.correctedByRouteParams && lastRouteKeyCorrectionRef.current !== routeState.routeKey) {
      lastRouteKeyCorrectionRef.current = routeState.routeKey;
      rgPerfMark('live match route key corrected', {
        focusMatchId: focusMatchId ?? null,
        focusRoomId: focusRoomId ?? null,
        hydratedMatchId: hydratedMatchId ?? null,
        hydratedRoomId: hydratedRoomId ?? null,
        matchId: routeState.matchId,
        roomId: routeState.roomId,
        routeKey: routeState.routeKey,
        source: 'track-run experience',
      });
    }

    return routeState.routeKey;
  }, [
    focusMatchId,
    focusRoomId,
    focusedDuelMatchIdRef,
    focusedGroupMatchIdRef,
    forceOpenActiveMatch,
    hydratedMatchId,
    hydratedMatchMode,
    hydratedRoomId,
    lastRouteKeyCorrectionRef,
    liveArenaPage,
    matchMode,
    matchRoom?.roomId,
    roomLinkedMatchContext?.matchId,
    visibleMatchRoom?.roomId,
  ]);

  const prepareMatchRoomMutation = useCallback<PrepareMatchRoomMutation>(async ({
    forceCleanup = false,
    inviteToken,
    source,
  }) => {
    const hasKnownActiveRoom = Boolean(matchRoom?.roomId || visibleMatchRoom?.roomId);
    if (!forceCleanup && !hasKnownActiveRoom) {
      rgPerfMark('stale cleanup skipped no blocker', {
        hasInviteToken: Boolean(inviteToken),
        source,
      });
      return true;
    }

    const cleanupOutcome = await runStaleRoomCleanupWithTimeout({ source });
    if (cleanupOutcome.status === 'timeout') {
      return !forceCleanup;
    }

    if (cleanupOutcome.status === 'error') {
      return !forceCleanup;
    }

    const { payload } = cleanupOutcome;

    if (payload.cleaned) {
      rgPerfMark('local room state cleared', {
        cleanedItems: payload.cleanedItems.join(','),
        source,
      });
      commitMatchRoom(payload.room);
      if (!payload.room) {
        setSelectedRoomFriendIds([]);
      }
    }

    if (payload.blocker && !payload.room) {
      rgPerfMark('already joined room detected', {
        blocker: payload.blocker,
        blockerSource: payload.blockerSource ?? payload.blocker,
        source,
      });
      setError(payload.message ?? '이미 진행 중인 매칭 상태가 있어요. 기존 상태를 먼저 정리한 뒤 다시 시도해주세요.');
      return false;
    }

    if (!payload.room) {
      return true;
    }

    rgPerfMark('already joined room detected', {
      blocker: payload.blocker ?? 'activeRoom',
      roomId: payload.room.roomId,
      source,
      state: payload.room.state,
    });
    commitMatchRoom(payload.room);

    if (
      inviteToken
      && payload.room.joined !== false
      && payload.room.inviteToken.toUpperCase() === inviteToken.toUpperCase()
    ) {
      navigateToMatchRoomWithTrace(`${source} existing room`, payload.room, payload.serverNow);
      return false;
    }

    if (inviteToken && payload.room.joined === false && payload.room.inviteToken.toUpperCase() === inviteToken.toUpperCase()) {
      return true;
    }

    setError(payload.message ?? '이미 참여 중인 방이 있어요. 기존 방을 먼저 나간 뒤 다시 시도해주세요.');
    return false;
  }, [
    commitMatchRoom,
    matchRoom?.roomId,
    navigateToMatchRoomWithTrace,
    setError,
    setSelectedRoomFriendIds,
    visibleMatchRoom?.roomId,
  ]);

  const isExitingRoom = useCallback((roomId?: string | null) => isMatchRoomExiting(roomId), []);

  return {
    buildTrackRunActiveRoomCheckRouteKey,
    isExitingRoom,
    prepareMatchRoomMutation,
  };
}
