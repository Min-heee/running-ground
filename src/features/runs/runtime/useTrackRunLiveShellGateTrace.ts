import { useEffect } from 'react';
import type { TrackRunLiveShellGateDecision } from '@/features/runs/lifecycle/trackRunLiveShellGate';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type UseTrackRunLiveShellGateTraceInput = {
  decision: TrackRunLiveShellGateDecision;
  requestedShell: string;
  routeShellHint?: string | null;
};

export function useTrackRunLiveShellGateTrace({
  decision,
  requestedShell,
  routeShellHint,
}: UseTrackRunLiveShellGateTraceInput) {
  useEffect(() => {
    rgPerfMark('live match shell gate decision', {
      blockedReason: decision.blockedReason,
      requestedShell,
      routeMatchId: decision.routeMatchId,
      routeShellHint: routeShellHint ?? null,
      shell: decision.shellKind,
      shouldForceLiveArena: decision.shouldForceLiveArena,
      shouldForceLiveShell: decision.shouldForceLiveShell,
      shouldShowReadyScreen: decision.shouldShowReadyScreen,
    });

    if (!decision.blockedReason) {
      return;
    }

    rgPerfMark('live match shell blocked reason', {
      reason: decision.blockedReason,
      requestedShell,
      routeMatchId: decision.routeMatchId,
      routeShellHint: routeShellHint ?? null,
      resolvedShell: decision.shellKind,
    });
  }, [
    decision.blockedReason,
    decision.routeMatchId,
    decision.shellKind,
    decision.shouldForceLiveArena,
    decision.shouldForceLiveShell,
    decision.shouldShowReadyScreen,
    requestedShell,
    routeShellHint,
  ]);
}
