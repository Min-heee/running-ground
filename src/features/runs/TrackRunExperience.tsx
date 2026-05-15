import {
  TrackRunExperienceRuntime,
  type TrackRunExperienceRuntimeProps,
} from '@/features/runs/containers/TrackRunExperienceRuntime';
import { useTrackRunRouteShellSelection } from '@/features/runs/hooks/useTrackRunRouteShellSelection';

type TrackRunExperienceProps = TrackRunExperienceRuntimeProps;

export function TrackRunExperience(props: TrackRunExperienceProps) {
  const routeShell = useTrackRunRouteShellSelection(props);

  return <TrackRunExperienceRuntime {...props} routeShellHint={routeShell.shell} />;
}
