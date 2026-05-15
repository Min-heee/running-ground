import { useEffect } from 'react';
import type { ComponentProps } from 'react';
import { RunningReadyScreen } from '@/features/runs/components/RunningReadyScreen';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type UseTrackRunIdleRuntimeInput = {
  active: boolean;
  readyScreenProps: ComponentProps<typeof RunningReadyScreen>;
};

export function useTrackRunIdleRuntime({
  active,
  readyScreenProps,
}: UseTrackRunIdleRuntimeInput) {
  useEffect(() => {
    if (!active) {
      return;
    }

    rgPerfMark('track run runtime adapter selected', {
      adapter: 'idle',
      source: 'track-run runtime',
    });
    rgPerfMark('idle runtime mounted', {
      source: 'track-run runtime',
    });
  }, [active]);

  return {
    readyScreenProps,
  };
}
