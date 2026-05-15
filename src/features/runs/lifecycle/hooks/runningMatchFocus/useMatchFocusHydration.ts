import { useCallback } from 'react';
import { hydrateLiveMatchRouteState } from '@/features/runs/lifecycle/liveMatchRouteHydration';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import type { FocusRunningMatchInput } from '@/features/runs/lifecycle/hooks/runningMatchFocus/types';

type HydrateMatchFocusRouteInput = Pick<
  FocusRunningMatchInput,
  'distanceKm' | 'matchId' | 'mode' | 'roomId' | 'slotStartAt' | 'source'
> & {
  navigationKey: string;
  preferArena: boolean;
  requestId: string;
};

export function useMatchFocusHydration() {
  return useCallback(({
    distanceKm,
    matchId,
    mode,
    navigationKey,
    preferArena,
    requestId,
    roomId,
    slotStartAt,
    source,
  }: HydrateMatchFocusRouteInput) => {
    if (!matchId) {
      return false;
    }

    hydrateLiveMatchRouteState({
      distanceKm,
      matchId,
      mode,
      preferArena,
      roomId,
      slotStartAt,
      source,
    });
    rgPerfMark('live match route state hydrated', {
      matchId,
      mode,
      navigationKey,
      preferArena,
      requestId,
      roomId: roomId ?? null,
      source,
    });
    rgPerfMark('live match route target resolved', {
      matchId,
      mode,
      navigationKey,
      preferArena,
      requestId,
      roomId: roomId ?? null,
      source,
      targetRoute: 'track-run',
      targetShell: 'live',
    });

    return true;
  }, []);
}
