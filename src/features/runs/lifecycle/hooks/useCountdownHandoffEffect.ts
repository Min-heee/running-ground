import { useEffect, useRef } from 'react';
import type { UpcomingRunningMatchItem } from '@/lib/api/types';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { shouldAutoFocusMatchArena } from '@/features/runs/lifecycle/matchStateMachine';

type FocusRunningMatchInput = {
  mode: Extract<RunMatchMode, 'duel' | 'group'>;
  matchId?: string;
  distanceKm?: number;
  slotStartAt?: string;
  isTestMatch?: boolean;
  preferArena?: boolean;
  roomId?: string;
};

type NextStartingMatch = {
  match: UpcomingRunningMatchItem;
  remainingSeconds: number;
} | null;

type UseCountdownHandoffEffectInput = {
  isIdle: boolean;
  nextStartingMatch: NextStartingMatch;
  focusRunningMatch: (input: FocusRunningMatchInput) => Promise<unknown>;
};

export function useCountdownHandoffEffect({
  isIdle,
  nextStartingMatch,
  focusRunningMatch,
}: UseCountdownHandoffEffectInput) {
  const countdownAutoOpenMatchIdRef = useRef<string | null>(null);
  const focusRunningMatchRef = useRef(focusRunningMatch);
  focusRunningMatchRef.current = focusRunningMatch;

  useEffect(() => {
    if (!nextStartingMatch || !shouldAutoFocusMatchArena(isIdle, nextStartingMatch.remainingSeconds)) {
      countdownAutoOpenMatchIdRef.current = null;
      return;
    }

    if (countdownAutoOpenMatchIdRef.current === nextStartingMatch.match.matchId) {
      return;
    }

    countdownAutoOpenMatchIdRef.current = nextStartingMatch.match.matchId;

    void focusRunningMatchRef.current({
      mode: nextStartingMatch.match.mode,
      matchId: nextStartingMatch.match.matchId,
      distanceKm: nextStartingMatch.match.distanceKm,
      slotStartAt: nextStartingMatch.match.slotStartAt,
      isTestMatch: nextStartingMatch.match.isTestMatch,
      preferArena: true,
    }).catch(() => {});
  }, [isIdle, nextStartingMatch]);
}
