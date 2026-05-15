import { useEffect } from 'react';

import { rgPerfMark } from '@/utils/rgPerfTrace';

import type { TrackRunMountTraceInput } from './types';

export function useTrackRunMountTrace({
  focusMatchId,
  focusMatchMode,
  focusRoomId,
  isMountedRef,
  liveMatchRouteHydration,
  mode,
  routeShellHint,
}: TrackRunMountTraceInput) {
  useEffect(() => {
    rgPerfMark('TrackRunExperience mount', {
      hydratedMatchId: liveMatchRouteHydration?.matchId ?? null,
      hydratedRoomId: liveMatchRouteHydration?.roomId ?? null,
      focusMatchId: focusMatchId ?? null,
      focusMatchMode: focusMatchMode ?? null,
      focusRoomId: focusRoomId ?? null,
      mode,
      routeShellHint: routeShellHint ?? null,
    });

    return () => {
      rgPerfMark('TrackRunExperience unmount', {
        mode,
        routeShellHint: routeShellHint ?? null,
      });
    };
  }, [
    focusMatchId,
    focusMatchMode,
    focusRoomId,
    liveMatchRouteHydration?.matchId,
    liveMatchRouteHydration?.roomId,
    mode,
    routeShellHint,
  ]);

  useEffect(() => () => {
    isMountedRef.current = false;
  }, [isMountedRef]);
}
