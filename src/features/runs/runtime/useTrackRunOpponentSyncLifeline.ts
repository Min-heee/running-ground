import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { AppState } from 'react-native';
import {
  OPPONENT_SYNC_LIFELINE_INTERVAL_MS,
  shouldFireOpponentSyncLifeline,
} from '@/features/runs/runtime/opponentSyncLifeline';
import type { RunningMatchStatusResponse } from '@/lib/api/types';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type MatchStatusLoader = (
  slotStartAt?: string,
  options?: { testMode?: boolean; distanceKm?: number; matchId?: string; forceAccept?: boolean },
) => Promise<unknown>;

type UseTrackRunOpponentSyncLifelineInput = {
  activeLiveMatchProgressMatchId: string | null;
  duelMatchStatusRef: MutableRefObject<RunningMatchStatusResponse | null>;
  groupMatchStatusRef: MutableRefObject<RunningMatchStatusResponse | null>;
  lastMatchStatusAppliedAtMsRef: MutableRefObject<number>;
  loadDuelMatchStatus: MatchStatusLoader;
  loadGroupMatchStatus: MatchStatusLoader;
};

// Opponent-sync lifeline (docs/opponent-poll-stall-diag-2026-07-06.md, Piece 2) — the
// trigger-agnostic guarantee that the foreground opponent channel can never silently die.
// Every regular delivery path runs through single-shot keyed-slot registries whose lose-path is
// dead until an effect re-runs; the ONLY channel that always recovered was the OS-resume path,
// because it is registry-free and reads its targets purely from refs. This hook is that path as
// a timer: armed once per active-match transition (renders provably exist there), then a plain
// 5s interval that reads ONLY refs — so neither render starvation nor a lost registry acquire can
// silence it. When no ACCEPTED status apply has landed for >8s while the app is foregrounded and
// a duel/group match is 'active', it fires ONE guarded status GET through the same loader funnel
// (vanish + forfeit + monotonic-serverNow guards) every other apply uses. Healthy steady state:
// the heartbeat/poll applies keep the stamp fresh, every tick no-ops — zero added requests, and
// the hook itself never sets state, so zero added renders.
export function useTrackRunOpponentSyncLifeline({
  activeLiveMatchProgressMatchId,
  duelMatchStatusRef,
  groupMatchStatusRef,
  lastMatchStatusAppliedAtMsRef,
  loadDuelMatchStatus,
  loadGroupMatchStatus,
}: UseTrackRunOpponentSyncLifelineInput) {
  // Per-render-refreshed loader ref (same pattern as useBlockingMatchStatusPolling's callbackRef):
  // the loaders are intentionally un-memoized per-render closures, so the timer must read the
  // freshest ones through a ref instead of re-subscribing the effect every render.
  const loadersRef = useRef({ loadDuelMatchStatus, loadGroupMatchStatus });
  loadersRef.current = { loadDuelMatchStatus, loadGroupMatchStatus };
  const lifelineFetchInFlightRef = useRef(false);

  useEffect(() => {
    if (!activeLiveMatchProgressMatchId) {
      return;
    }

    const timer = setInterval(() => {
      const mode: 'duel' | 'group' | null = duelMatchStatusRef.current?.state === 'active'
        ? 'duel'
        : groupMatchStatusRef.current?.state === 'active'
          ? 'group'
          : null;
      const nowMs = Date.now();
      if (!shouldFireOpponentSyncLifeline({
        appStateActive: AppState.currentState === 'active',
        inFlight: lifelineFetchInFlightRef.current,
        lastAppliedMs: lastMatchStatusAppliedAtMsRef.current,
        matchActive: mode !== null,
        nowMs,
      })) {
        return;
      }

      rgPerfMark('opponent sync lifeline fired', {
        matchId: activeLiveMatchProgressMatchId,
        mode,
        sinceLastAppliedMs: nowMs - lastMatchStatusAppliedAtMsRef.current,
        source: 'opponent sync lifeline',
      });
      lifelineFetchInFlightRef.current = true;
      const loadMatchStatus = mode === 'duel'
        ? loadersRef.current.loadDuelMatchStatus
        : loadersRef.current.loadGroupMatchStatus;
      // No-arg call: the loader resolves the matchId from focusedDuel/GroupMatchIdRef and applies
      // the response through the full existing guard chain — a stale/forfeited snapshot is dropped
      // exactly as it would be on any other channel.
      void loadMatchStatus()
        .catch(() => {})
        .finally(() => {
          lifelineFetchInFlightRef.current = false;
        });
    }, OPPONENT_SYNC_LIFELINE_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [
    activeLiveMatchProgressMatchId,
    duelMatchStatusRef,
    groupMatchStatusRef,
    lastMatchStatusAppliedAtMsRef,
  ]);
}
