import { useEffect, useMemo, useRef } from 'react';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';
import type { LastSyncedMatchProgress } from '@/features/runs/viewModels/matchProgress';
import type { TrackerStatus } from '@/features/runs/hooks/useRunTracking';
import type {
  RunningMatchRoom,
  RunningMatchStatusResponse,
} from '@/lib/api/types';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type UseTrackRunIdleViewModelInput = {
  mode: 'tab' | 'stack';
  matchMode: RunMatchMode;
  trackingStatus: TrackerStatus;
  hydratedFocusMatchId?: string | null;
  hydratedFocusRoomId?: string | null;
  roomInviteToken?: string | null;
  matchRoom: RunningMatchRoom | null;
  visibleMatchRoom: RunningMatchRoom | null;
  roomLinkedMatchContext: PartyRunLinkedMatchContext | null;
  duelMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatus: RunningMatchStatusResponse | null;
  lastSyncedMatchProgress: LastSyncedMatchProgress | null;
  forceOpenActiveMatch: boolean;
  isCreatingMatchRoom: boolean;
  isJoiningMatchRoom: boolean;
  isLeavingMatchRoom: boolean;
  isRequestingDuelMatch: boolean;
  isRequestingGroupMatch: boolean;
};

function normalizeId(value?: string | null) {
  return value && value.trim().length > 0 ? value : null;
}

export function useTrackRunIdleViewModel({
  mode,
  matchMode,
  trackingStatus,
  hydratedFocusMatchId,
  hydratedFocusRoomId,
  roomInviteToken,
  matchRoom,
  visibleMatchRoom,
  roomLinkedMatchContext,
  duelMatchStatus,
  groupMatchStatus,
  lastSyncedMatchProgress,
  forceOpenActiveMatch,
  isCreatingMatchRoom,
  isJoiningMatchRoom,
  isLeavingMatchRoom,
  isRequestingDuelMatch,
  isRequestingGroupMatch,
}: UseTrackRunIdleViewModelInput) {
  const lastLoggedIdleKeyRef = useRef<string | null>(null);
  const activeRoomId = normalizeId(hydratedFocusRoomId)
    ?? normalizeId(matchRoom?.roomId)
    ?? normalizeId(visibleMatchRoom?.roomId)
    ?? null;
  const activeMatchId = normalizeId(hydratedFocusMatchId)
    ?? normalizeId(roomLinkedMatchContext?.matchId)
    ?? normalizeId(duelMatchStatus?.matchId)
    ?? normalizeId(groupMatchStatus?.matchId)
    ?? normalizeId(lastSyncedMatchProgress?.matchId)
    ?? null;
  const hasPendingAction = Boolean(
    isCreatingMatchRoom
    || isJoiningMatchRoom
    || isLeavingMatchRoom
    || isRequestingDuelMatch
    || isRequestingGroupMatch
  );
  const hasInviteToken = Boolean(normalizeId(roomInviteToken));
  const isIdleTabRuntime = Boolean(
    mode === 'tab'
    && trackingStatus === 'idle'
    && !activeRoomId
    && !activeMatchId
    && !forceOpenActiveMatch
    && !hasInviteToken
    && !hasPendingAction
  );
  const idleReason = isIdleTabRuntime
    ? 'tab-idle-no-room-no-match'
    : activeMatchId
      ? 'active-match'
      : activeRoomId
        ? 'active-room'
        : trackingStatus !== 'idle'
          ? `tracking-${trackingStatus}`
          : forceOpenActiveMatch
            ? 'forced-arena'
            : hasInviteToken
              ? 'invite-token'
              : hasPendingAction
                ? 'pending-action'
                : mode === 'stack'
                  ? 'stack-route'
                  : 'interactive';

  const model = useMemo(() => ({
    activeMatchId,
    activeRoomId,
    disableHeavySubscriptions: isIdleTabRuntime,
    idleReason,
    isIdleTabRuntime,
    shouldRunActiveRoomCheck: !isIdleTabRuntime,
    shouldRunCountdownTicker: !isIdleTabRuntime,
    shouldRunLiveMatchProgress: !isIdleTabRuntime,
    shouldRunPartyRunSync: !isIdleTabRuntime,
    shouldRunTrackingSubscriptions: !isIdleTabRuntime,
  }), [
    activeMatchId,
    activeRoomId,
    idleReason,
    isIdleTabRuntime,
  ]);

  useEffect(() => {
    if (!model.disableHeavySubscriptions) {
      lastLoggedIdleKeyRef.current = null;
      return;
    }

    const idleKey = [
      model.idleReason,
      matchMode,
      trackingStatus,
      model.activeRoomId ?? 'no-room',
      model.activeMatchId ?? 'no-match',
    ].join(':');

    if (lastLoggedIdleKeyRef.current === idleKey) {
      return;
    }

    lastLoggedIdleKeyRef.current = idleKey;
    const detail = {
      activeMatchId: model.activeMatchId,
      activeRoomId: model.activeRoomId,
      matchMode,
      reason: model.idleReason,
      trackingStatus,
    };
    rgPerfMark('track run idle subscriptions disabled', detail);
    rgPerfMark('track run idle render source', detail);
    rgPerfMark('track run heavy hooks skipped idle', detail);
  }, [
    matchMode,
    model.activeMatchId,
    model.activeRoomId,
    model.disableHeavySubscriptions,
    model.idleReason,
    trackingStatus,
  ]);

  return model;
}
