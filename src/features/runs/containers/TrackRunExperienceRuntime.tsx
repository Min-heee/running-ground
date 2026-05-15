import {
  TrackRunExperienceRuntime as TrackRunExperienceRuntimeModel,
  type TrackRunExperienceRuntimeProps,
} from '@/features/runs/runtime/TrackRunExperienceRuntimeModel';

export type { TrackRunExperienceRuntimeProps };

export function TrackRunExperienceRuntime(props: TrackRunExperienceRuntimeProps) {
  return <TrackRunExperienceRuntimeModel {...props} />;
}
