import { useEffect, useMemo } from 'react';
import {
  TrackRunExperienceRuntime,
  type TrackRunExperienceRuntimeProps,
} from '@/features/runs/containers/TrackRunExperienceRuntime';
import { getLiveMatchRouteHydration } from '@/features/runs/lifecycle/liveMatchRouteHydration';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type TrackRunExperienceProps = TrackRunExperienceRuntimeProps;

function selectTrackRunShellFromRoute({
  mode,
  focusMatchMode,
  focusMatchId,
  focusRoomId,
  forceMatchArena,
  roomInviteToken,
}: TrackRunExperienceProps) {
  const hydration = getLiveMatchRouteHydration();
  const hydratedMatchId = focusMatchId ?? (
    hydration?.mode === (focusMatchMode ?? hydration?.mode)
      ? hydration?.matchId
      : undefined
  );
  const hydratedRoomId = focusRoomId ?? hydration?.roomId;

  if (hydratedMatchId || forceMatchArena || hydration?.preferArena) {
    return {
      hydration,
      shell: 'live' as const,
    };
  }

  if (hydratedRoomId || roomInviteToken) {
    return {
      hydration,
      shell: 'lobby' as const,
    };
  }

  return {
    hydration,
    shell: mode === 'tab' ? 'idle' as const : 'lobby' as const,
  };
}

export function TrackRunExperience(props: TrackRunExperienceProps) {
  const {
    focusMatchId,
    focusMatchMode,
    focusRoomId,
    forceMatchArena,
    mode,
    roomInviteToken,
  } = props;
  const routeShell = useMemo(() => selectTrackRunShellFromRoute({
    focusMatchId,
    focusMatchMode,
    focusRoomId,
    forceMatchArena,
    mode,
    roomInviteToken,
  }), [
    focusMatchId,
    focusMatchMode,
    focusRoomId,
    forceMatchArena,
    mode,
    roomInviteToken,
  ]);

  useEffect(() => {
    rgPerfMark('track run shell selected', {
      hydratedMatchId: routeShell.hydration?.matchId ?? null,
      hydratedRoomId: routeShell.hydration?.roomId ?? null,
      shell: routeShell.shell,
      source: 'track-run shell router',
    });
  }, [
    routeShell.hydration?.matchId,
    routeShell.hydration?.roomId,
    routeShell.shell,
  ]);

  return <TrackRunExperienceRuntime {...props} />;
}
