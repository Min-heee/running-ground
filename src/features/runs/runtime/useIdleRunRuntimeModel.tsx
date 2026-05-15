import { useMemo } from 'react';
import type { UseIdleRunRuntimeModelInput } from '@/features/runs/runtime/idleRunRuntimeTypes';
import { useIdleRunInviteCodeModel } from '@/features/runs/runtime/useIdleRunInviteCodeModel';
import { useIdleRunModeModel } from '@/features/runs/runtime/useIdleRunModeModel';
import { useIdleRunPendingStateModel } from '@/features/runs/runtime/useIdleRunPendingStateModel';
import { useIdleRunRoomEntryModel } from '@/features/runs/runtime/useIdleRunRoomEntryModel';
import { useIdleRunSoloActionModel } from '@/features/runs/runtime/useIdleRunSoloActionModel';

export function useIdleRunRuntimeModel(input: UseIdleRunRuntimeModelInput) {
  const inviteCodeModel = useIdleRunInviteCodeModel(input);
  const pendingStateModel = useIdleRunPendingStateModel(input);
  const {
    readyDuelSetupProps,
    readyGroupSetupProps,
    readyMatchOptionProps,
    trackRunShellKind,
  } = useIdleRunModeModel(input);

  const readyPartyRunProps = useIdleRunRoomEntryModel({
    ...input,
    ...inviteCodeModel,
  });

  const matchSetupProps = useMemo(() => ({
    matchOptionProps: readyMatchOptionProps,
    partyRunProps: readyPartyRunProps,
    duelSetupProps: readyDuelSetupProps,
    groupSetupProps: readyGroupSetupProps,
  }), [
    readyDuelSetupProps,
    readyGroupSetupProps,
    readyMatchOptionProps,
    readyPartyRunProps,
  ]);

  const readyScreenProps = useIdleRunSoloActionModel({
    ...input,
    ...pendingStateModel,
    matchSetupProps,
  });

  return {
    readyScreenProps,
    trackRunShellKind: input.isIdle ? trackRunShellKind : 'live',
  };
}
