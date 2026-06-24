import type { MatchLifecycleStage } from '@/features/runs/lifecycle/matchLifecycleController';
import type { TrackRunShellKind } from '@/features/runs/components/shells/TrackRunShellTypes';
import { isRouteFocusMatchTerminated } from '@/features/runs/lifecycle/terminatedRouteFocusMatch';

type ResolveRouteForcedLiveArenaInput = {
  isRunning: boolean;
  currentUserDoneWithCurrentMatch: boolean;
  hydratedFocusMatchId?: string | null;
  hydratedForceMatchArena?: boolean | null;
  routeHydrationMatchId?: string | null;
  routeHydrationPreferArena?: boolean | null;
  routeShellHint?: TrackRunShellKind | null;
  matchLifecycleStage?: MatchLifecycleStage | null;
};

function isLiveLifecycleStage(stage: MatchLifecycleStage | null | undefined) {
  return stage === 'arming' || stage === 'countdown' || stage === 'active';
}

// Whether the running tab should force-open the live arena purely from the route
// (forceMatchArena / focusMatchId / preferArena / routeShellHint='live'), independent of
// any locally tracked live match state.
//
// The suppression has two layers, both gated on `!isRunning` so an in-progress race is
// never reset:
//   1. currentUserDoneWithCurrentMatch — the live duel/group status reports the user is
//      finished/forfeited. Valid only until the post-run runtime reset nulls those statuses.
//   2. isRouteFocusMatchTerminated — a module tombstone set by the post-run reset, keyed to
//      the ended matchId. This covers the after-reset window where the statuses are null
//      again but the stale forceMatchArena route param would otherwise re-open the live
//      measuring shell. Scoped to the ended matchId, so a brand-new match, the reservation
//      handoff pre-mount, and an in-progress race are all unaffected.
export function resolveRouteForcedLiveArena({
  isRunning,
  currentUserDoneWithCurrentMatch,
  hydratedFocusMatchId,
  hydratedForceMatchArena,
  routeHydrationMatchId,
  routeHydrationPreferArena,
  routeShellHint,
  matchLifecycleStage,
}: ResolveRouteForcedLiveArenaInput): boolean {
  const routeFocusMatchTerminated = !isRunning && (
    isRouteFocusMatchTerminated(hydratedFocusMatchId)
    || isRouteFocusMatchTerminated(routeHydrationMatchId)
  );
  const shouldSuppressDoneMatchAutoOpen = (currentUserDoneWithCurrentMatch && !isRunning)
    || routeFocusMatchTerminated;

  return Boolean(
    !shouldSuppressDoneMatchAutoOpen
    && hydratedFocusMatchId
    && (
      hydratedForceMatchArena
      || routeHydrationPreferArena
      || (routeShellHint === 'live' && isLiveLifecycleStage(matchLifecycleStage))
    ),
  );
}
