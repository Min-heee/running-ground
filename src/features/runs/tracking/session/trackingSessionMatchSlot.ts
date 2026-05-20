import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { MatchLifecycleController } from '@/features/runs/lifecycle/matchLifecycleController';
import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';
import type { RunningMatchStatusResponse } from '@/lib/api/types';

export type ActiveMatchSlotStartInput = {
  duelMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatus: RunningMatchStatusResponse | null;
  matchLifecycleController?: MatchLifecycleController;
  matchMode: RunMatchMode;
  partyRoomMatchId?: string | null;
  partyRoomMatchMode?: MatchLifecycleController['mode'];
  partyRoomMatchSlotStartAt?: string | null;
  roomLinkedMatchContext: PartyRunLinkedMatchContext | null;
};

function isPartyRoomFallbackCompatible(
  matchLifecycleController: MatchLifecycleController,
  partyRoomMatchId?: string | null,
  partyRoomMatchMode?: MatchLifecycleController['mode'],
) {
  if (partyRoomMatchId && matchLifecycleController.matchId && partyRoomMatchId !== matchLifecycleController.matchId) {
    return false;
  }

  if (partyRoomMatchMode && matchLifecycleController.mode && partyRoomMatchMode !== matchLifecycleController.mode) {
    return false;
  }

  return true;
}

export function resolveActiveMatchSlotStartAt({
  duelMatchStatus,
  groupMatchStatus,
  matchLifecycleController,
  matchMode,
  partyRoomMatchId,
  partyRoomMatchMode,
  partyRoomMatchSlotStartAt,
  roomLinkedMatchContext,
}: ActiveMatchSlotStartInput) {
  if (matchLifecycleController?.stage !== 'active') {
    return null;
  }

  if (
    matchLifecycleController.source === 'party-room'
    && roomLinkedMatchContext
    && roomLinkedMatchContext.matchId === matchLifecycleController.matchId
    && roomLinkedMatchContext.mode === matchLifecycleController.mode
  ) {
    return roomLinkedMatchContext.slotStartAt;
  }

  if (
    matchLifecycleController.source === 'party-room'
    && partyRoomMatchSlotStartAt
    && isPartyRoomFallbackCompatible(matchLifecycleController, partyRoomMatchId, partyRoomMatchMode)
  ) {
    return partyRoomMatchSlotStartAt;
  }

  if (matchMode === 'duel' && duelMatchStatus?.state === 'active') {
    return duelMatchStatus.slotStartAt;
  }

  if (matchMode === 'group' && groupMatchStatus?.state === 'active') {
    return groupMatchStatus.slotStartAt;
  }

  if (
    partyRoomMatchSlotStartAt
    && partyRoomMatchId
    && partyRoomMatchId === matchLifecycleController.matchId
    && (!partyRoomMatchMode || partyRoomMatchMode === matchLifecycleController.mode)
  ) {
    return partyRoomMatchSlotStartAt;
  }

  return null;
}
