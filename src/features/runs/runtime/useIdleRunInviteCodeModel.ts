import { useMemo } from 'react';
import type { UseIdleRunRuntimeModelInput } from '@/features/runs/runtime/idleRunRuntimeTypes';

type UseIdleRunInviteCodeModelInput = Pick<
  UseIdleRunRuntimeModelInput,
  'roomInviteTokenInput' | 'setRoomInviteTokenInput'
>;

export function useIdleRunInviteCodeModel({
  roomInviteTokenInput,
  setRoomInviteTokenInput,
}: UseIdleRunInviteCodeModelInput) {
  return useMemo(() => ({
    inviteTokenInput: roomInviteTokenInput,
    onInviteTokenChange: setRoomInviteTokenInput,
  }), [roomInviteTokenInput, setRoomInviteTokenInput]);
}
