import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { LiveMatchRouteHydration } from '@/features/runs/lifecycle/liveMatchRouteHydration';

export type TrackRunRouteShellKind = 'idle' | 'lobby' | 'live';

export type TrackRunShellSelectionInput = {
  mode: 'tab' | 'stack';
  focusMatchMode?: Extract<RunMatchMode, 'duel' | 'group'>;
  focusMatchId?: string;
  focusRoomId?: string;
  forceMatchArena?: boolean;
  roomInviteToken?: string;
};

export type TrackRunShellSelection = {
  hydration: LiveMatchRouteHydration | null;
  shell: TrackRunRouteShellKind;
};

export function selectTrackRunShellFromRoute(
  {
    mode,
    focusMatchMode,
    focusMatchId,
    focusRoomId,
    forceMatchArena,
    roomInviteToken,
  }: TrackRunShellSelectionInput,
  hydration: LiveMatchRouteHydration | null,
): TrackRunShellSelection {
  const hydratedMatchId = focusMatchId ?? (
    hydration?.mode === (focusMatchMode ?? hydration?.mode)
      ? hydration?.matchId
      : undefined
  );
  const hydratedRoomId = focusRoomId ?? hydration?.roomId;

  if (hydratedMatchId || forceMatchArena || hydration?.preferArena) {
    return {
      hydration,
      shell: 'live',
    };
  }

  if (hydratedRoomId || roomInviteToken) {
    return {
      hydration,
      shell: 'lobby',
    };
  }

  return {
    hydration,
    shell: mode === 'tab' ? 'idle' : 'lobby',
  };
}
