import { useMemo } from 'react';
import type {
  PartyRunProps,
  UseIdleRunRuntimeModelInput,
} from '@/features/runs/runtime/idleRunRuntimeTypes';

type UseIdleRunRoomEntryModelInput = Pick<
  UseIdleRunRuntimeModelInput,
  | 'isJoiningMatchRoom'
  | 'isLeavingMatchRoom'
  | 'matchMode'
  | 'matchRoom'
  | 'onAcceptRoomInvite'
  | 'onDeclineRoomInvite'
  | 'onJoinRoom'
  | 'roomMatchMode'
  | 'setRoomMatchMode'
  | 'visibleMatchRoom'
  | 'visibleMatchRoomIsInviteOnly'
> & Pick<PartyRunProps, 'inviteTokenInput' | 'onInviteTokenChange'>;

export function useIdleRunRoomEntryModel({
  inviteTokenInput,
  isJoiningMatchRoom,
  isLeavingMatchRoom,
  matchMode,
  matchRoom,
  onAcceptRoomInvite,
  onDeclineRoomInvite,
  onInviteTokenChange,
  onJoinRoom,
  roomMatchMode,
  setRoomMatchMode,
  visibleMatchRoom,
  visibleMatchRoomIsInviteOnly,
}: UseIdleRunRoomEntryModelInput) {
  return useMemo(() => ({
    visibleRoom: visibleMatchRoom,
    currentRoom: matchRoom,
    isSelected: matchMode === 'room',
    isInviteOnly: visibleMatchRoomIsInviteOnly,
    isJoining: isJoiningMatchRoom,
    isLeaving: isLeavingMatchRoom,
    roomMode: roomMatchMode,
    inviteTokenInput,
    onRoomModeChange: setRoomMatchMode,
    onInviteTokenChange,
    onAcceptInvite: onAcceptRoomInvite,
    onDeclineInvite: onDeclineRoomInvite,
    onJoinRoom,
  }), [
    inviteTokenInput,
    isJoiningMatchRoom,
    isLeavingMatchRoom,
    matchMode,
    matchRoom,
    onAcceptRoomInvite,
    onDeclineRoomInvite,
    onInviteTokenChange,
    onJoinRoom,
    roomMatchMode,
    setRoomMatchMode,
    visibleMatchRoom,
    visibleMatchRoomIsInviteOnly,
  ]);
}
