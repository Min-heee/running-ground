import type { TrackRunShellKind } from '@/features/runs/components/shells/TrackRunShellTypes';
import type { MatchLifecycleStage } from '@/features/runs/lifecycle/matchLifecycleController';

type TrackRunLiveShellGateInput = {
  focusMatchId?: string | null;
  forceMatchArena?: boolean | null;
  hydratedMatchId?: string | null;
  isCurrentUserDoneWithMatch?: boolean;
  matchLifecycleStage?: MatchLifecycleStage | null;
  requestedShell: TrackRunShellKind;
  requestedShouldShowReadyScreen: boolean;
  routePreferArena?: boolean | null;
  routeShellHint?: TrackRunShellKind;
  showLiveArena: boolean;
};

export type TrackRunLiveShellGateDecision = {
  blockedReason: string | null;
  routeMatchId: string | null;
  shellKind: TrackRunShellKind;
  shouldForceLiveArena: boolean;
  shouldForceLiveShell: boolean;
  shouldShowReadyScreen: boolean;
};

function isLiveLifecycleStage(stage: MatchLifecycleStage | null | undefined) {
  return stage === 'arming' || stage === 'countdown' || stage === 'active';
}

export function resolveTrackRunLiveShellGate({
  focusMatchId,
  forceMatchArena,
  hydratedMatchId,
  isCurrentUserDoneWithMatch = false,
  matchLifecycleStage,
  requestedShell,
  requestedShouldShowReadyScreen,
  routePreferArena,
  routeShellHint,
  showLiveArena,
}: TrackRunLiveShellGateInput): TrackRunLiveShellGateDecision {
  const routeMatchId = focusMatchId ?? hydratedMatchId ?? null;
  const hasLiveRouteHint = Boolean(routeMatchId && routeShellHint === 'live');
  const shouldBlockDoneLiveRoute = Boolean(isCurrentUserDoneWithMatch && hasLiveRouteHint);
  const shouldForceLiveShell = Boolean(!isCurrentUserDoneWithMatch && hasLiveRouteHint);
  const shouldForceLiveArena = Boolean(
    !isCurrentUserDoneWithMatch
    &&
    routeMatchId
    && (
      showLiveArena
      || forceMatchArena
      || routePreferArena
      || (shouldForceLiveShell && isLiveLifecycleStage(matchLifecycleStage))
    ),
  );
  const blockedReason = shouldBlockDoneLiveRoute
    ? 'current-user-done-with-match'
    : shouldForceLiveShell && requestedShell !== 'live'
      ? `${requestedShell}-shell-would-block-live-route`
      : null;

  return {
    blockedReason,
    routeMatchId,
    shellKind: shouldForceLiveShell ? 'live' : requestedShell,
    shouldForceLiveArena,
    shouldForceLiveShell,
    shouldShowReadyScreen: shouldForceLiveShell ? false : requestedShouldShowReadyScreen,
  };
}
