import type { TrackRunShellKind } from '@/features/runs/components/shells/TrackRunShellTypes';
import type { MatchLifecycleStage } from '@/features/runs/lifecycle/matchLifecycleController';

type TrackRunLiveShellGateInput = {
  focusMatchId?: string | null;
  forceMatchArena?: boolean | null;
  hydratedMatchId?: string | null;
  linkedMatchContext?: {
    matchId: string;
    state: 'matched' | 'active';
  } | null;
  matchLifecycleStage?: MatchLifecycleStage | null;
  mountedLiveMatchId?: string | null;
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
  linkedMatchContext,
  matchLifecycleStage,
  mountedLiveMatchId,
  requestedShell,
  requestedShouldShowReadyScreen,
  routePreferArena,
  routeShellHint,
  showLiveArena,
}: TrackRunLiveShellGateInput): TrackRunLiveShellGateDecision {
  const safeMountedLiveMatchId = isLiveLifecycleStage(matchLifecycleStage)
    ? mountedLiveMatchId
    : null;
  const isLinkedLiveMatch = linkedMatchContext?.state === 'matched'
    || linkedMatchContext?.state === 'active';
  const safeLinkedMatchId = isLiveLifecycleStage(matchLifecycleStage) && isLinkedLiveMatch
    ? linkedMatchContext?.matchId ?? null
    : null;
  const routeMatchId = focusMatchId
    ?? hydratedMatchId
    ?? safeMountedLiveMatchId
    ?? safeLinkedMatchId
    ?? null;
  const shouldForceLiveShell = Boolean(routeMatchId && routeShellHint === 'live');
  const shouldForceLiveArena = Boolean(
    routeMatchId
    && (
      showLiveArena
      || forceMatchArena
      || routePreferArena
      || (shouldForceLiveShell && isLiveLifecycleStage(matchLifecycleStage))
    ),
  );
  const blockedReason = shouldForceLiveShell && requestedShell !== 'live'
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
