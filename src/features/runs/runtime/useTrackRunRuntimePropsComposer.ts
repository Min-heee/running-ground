import type { ComponentProps } from 'react';
import { TrackRunExperienceView } from '@/features/runs/components/TrackRunExperienceView';
import { useTrackRunRuntimeModelBuilder } from '@/features/runs/runtime/useTrackRunRuntimeModelBuilder';

type TrackRunExperienceViewProps = ComponentProps<typeof TrackRunExperienceView>;

type UseTrackRunRuntimePropsComposerInput = Omit<TrackRunExperienceViewProps, 'readyScreenProps'> & {
  readyScreenProps: Parameters<typeof useTrackRunRuntimeModelBuilder>[0]['readyScreenProps'];
};

export function useTrackRunRuntimePropsComposer({
  readyScreenProps,
  shellKind,
  ...viewProps
}: UseTrackRunRuntimePropsComposerInput): TrackRunExperienceViewProps {
  const {
    runtimeReadyScreenProps,
  } = useTrackRunRuntimeModelBuilder({
    readyScreenProps,
    trackRunShellKind: shellKind,
  });

  return {
    ...viewProps,
    readyScreenProps: runtimeReadyScreenProps,
    shellKind,
  };
}
