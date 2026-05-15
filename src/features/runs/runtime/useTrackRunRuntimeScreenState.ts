import type { MutableRefObject } from 'react';
import {
  shouldUseCenteredMatchCountdown,
  shouldUseFullscreenMatchCountdown,
} from '@/features/runs/lifecycle/matchStateMachine';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';

type CountdownEntry = {
  remainingSeconds: number | null;
} | null;

type LiveMatchViewConfirmation = {
  matchId: string | null;
  mode: Extract<RunMatchMode, 'duel' | 'group'> | null;
  showLiveArena: boolean;
};

type UseTrackRunRuntimeScreenStateInput = {
  effectiveShowLiveArena: boolean;
  isIdle: boolean;
  isStarting: boolean;
  liveMatchStartupIdentity: string | null;
  liveMatchRenderMode: Extract<RunMatchMode, 'duel' | 'group'> | null;
  liveMatchViewConfirmationRef: MutableRefObject<LiveMatchViewConfirmation>;
  roomCountdownEntry: CountdownEntry;
  soloStartCountdownSeconds: number | null;
  visibleCountdownEntry: CountdownEntry;
};

export function useTrackRunRuntimeScreenState({
  effectiveShowLiveArena,
  isIdle,
  isStarting,
  liveMatchStartupIdentity,
  liveMatchRenderMode,
  liveMatchViewConfirmationRef,
  roomCountdownEntry,
  soloStartCountdownSeconds,
  visibleCountdownEntry,
}: UseTrackRunRuntimeScreenStateInput) {
  liveMatchViewConfirmationRef.current = {
    matchId: liveMatchStartupIdentity,
    mode: liveMatchRenderMode,
    showLiveArena: effectiveShowLiveArena,
  };

  const shouldShowFullscreenMatchCountdown =
    isIdle
    && shouldUseFullscreenMatchCountdown({
      hasCountdownEntry: Boolean(visibleCountdownEntry),
      remainingSeconds: visibleCountdownEntry?.remainingSeconds ?? null,
    });
  const shouldShowCenteredMatchCountdown = shouldUseCenteredMatchCountdown({
    hasCountdownEntry: Boolean(visibleCountdownEntry),
    remainingSeconds: visibleCountdownEntry?.remainingSeconds ?? null,
    showLiveArena: effectiveShowLiveArena,
    hasRoomCountdownEntry: Boolean(roomCountdownEntry),
  });

  return {
    runtimeSoloStartCountdownSeconds: isStarting && typeof soloStartCountdownSeconds === 'number'
      ? soloStartCountdownSeconds
      : null,
    shouldShowCenteredMatchCountdown,
    shouldShowFullscreenMatchCountdown,
  };
}
