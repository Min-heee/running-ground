import { useMemo } from 'react';
import type { UseIdleRunRuntimeModelInput } from '@/features/runs/runtime/idleRunRuntimeTypes';

type UseIdleRunPendingStateModelInput = Pick<
  UseIdleRunRuntimeModelInput,
  'isCreatingMatchRoom' | 'matchMode'
>;

export function useIdleRunPendingStateModel({
  isCreatingMatchRoom,
  matchMode,
}: UseIdleRunPendingStateModelInput) {
  return useMemo(() => ({
    readyActionDisabled: matchMode === 'room' ? isCreatingMatchRoom : false,
    readyActionLoadingLabel: matchMode === 'room' && isCreatingMatchRoom ? '방 만드는 중...' : undefined,
  }), [isCreatingMatchRoom, matchMode]);
}
