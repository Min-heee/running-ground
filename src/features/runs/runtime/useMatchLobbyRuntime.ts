import { useEffect } from 'react';
import type { ComponentProps } from 'react';
import { RunningReadyScreen } from '@/features/runs/components/RunningReadyScreen';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type UseMatchLobbyRuntimeInput = {
  active: boolean;
  readyScreenProps: ComponentProps<typeof RunningReadyScreen>;
};

export function useMatchLobbyRuntime({
  active,
  readyScreenProps,
}: UseMatchLobbyRuntimeInput) {
  useEffect(() => {
    if (!active) {
      return;
    }

    rgPerfMark('track run runtime adapter selected', {
      adapter: 'lobby',
      source: 'track-run runtime',
    });
    rgPerfMark('lobby runtime mounted', {
      source: 'track-run runtime',
    });
  }, [active]);

  return {
    readyScreenProps,
  };
}
