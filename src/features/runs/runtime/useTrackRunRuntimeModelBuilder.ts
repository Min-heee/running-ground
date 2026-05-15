import type { ComponentProps } from 'react';
import { RunningReadyScreen } from '@/features/runs/components/RunningReadyScreen';
import { useMatchLobbyRuntime } from '@/features/runs/runtime/useMatchLobbyRuntime';
import { useTrackRunIdleRuntime } from '@/features/runs/runtime/useTrackRunIdleRuntime';

type UseTrackRunRuntimeModelBuilderInput = {
  readyScreenProps: ComponentProps<typeof RunningReadyScreen>;
  trackRunShellKind: 'idle' | 'lobby' | 'live';
};

export function useTrackRunRuntimeModelBuilder({
  readyScreenProps,
  trackRunShellKind,
}: UseTrackRunRuntimeModelBuilderInput) {
  const idleRuntime = useTrackRunIdleRuntime({
    active: trackRunShellKind === 'idle',
    readyScreenProps,
  });
  const lobbyRuntime = useMatchLobbyRuntime({
    active: trackRunShellKind === 'lobby',
    readyScreenProps,
  });

  return {
    runtimeReadyScreenProps: trackRunShellKind === 'idle'
      ? idleRuntime.readyScreenProps
      : lobbyRuntime.readyScreenProps,
  };
}
