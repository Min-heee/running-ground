import { useEffect, useMemo } from 'react';
import { getLiveMatchRouteHydration } from '@/features/runs/lifecycle/liveMatchRouteHydration';
import {
  selectTrackRunShellFromRoute,
  type TrackRunShellSelection,
  type TrackRunShellSelectionInput,
} from '@/features/runs/lifecycle/trackRunShellSelection';
import { rgPerfMark } from '@/utils/rgPerfTrace';

export function useTrackRunRouteShellSelection(input: TrackRunShellSelectionInput): TrackRunShellSelection {
  const {
    focusMatchId,
    focusMatchMode,
    focusRoomId,
    forceMatchArena,
    mode,
    roomInviteToken,
  } = input;
  const hydration = getLiveMatchRouteHydration();
  const selectionInput = useMemo(() => ({
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
  const selection = useMemo(() => selectTrackRunShellFromRoute(selectionInput, hydration), [
    hydration,
    selectionInput,
  ]);

  useEffect(() => {
    rgPerfMark('track run shell selected', {
      hydratedMatchId: selection.hydration?.matchId ?? null,
      hydratedRoomId: selection.hydration?.roomId ?? null,
      shell: selection.shell,
      source: 'track-run shell router',
    });
  }, [
    selection.hydration?.matchId,
    selection.hydration?.roomId,
    selection.shell,
  ]);

  return selection;
}
