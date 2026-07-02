import { useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { unmarkLiveMatchMounted } from '@/features/runs/lifecycle/liveMatchMountedRegistry';
import {
  isLiveLifecycleStage,
  type MatchLifecycleStage,
} from '@/features/runs/lifecycle/matchLifecycleController';
import type { TrackRunLiveShellGateDecision } from '@/features/runs/lifecycle/trackRunLiveShellGate';
import type { LoadMatchStatus } from '@/features/runs/runtime/trackRunRuntimeMatchActionTypes';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type UseTrackRunWedgedLoadingWatchdogInput = {
  activeDuelSlotStartAt: string;
  activeGroupSlotStartAt: string;
  hydratedFocusMatchMode: Extract<RunMatchMode, 'duel' | 'group'> | undefined;
  isMountedRef: MutableRefObject<boolean>;
  isResolvingFocusedMatch: boolean;
  liveMatchMountedRef: MutableRefObject<{ matchId: string | null; mode: 'duel' | 'group'; mountedAtMs: number } | null>;
  liveMatchViewConfirmationRef: MutableRefObject<{
    matchId: string | null;
    mode: 'duel' | 'group' | null;
    showLiveArena: boolean;
  }>;
  liveShellGateDecision: TrackRunLiveShellGateDecision;
  loadDuelMatchStatus: LoadMatchStatus;
  loadGroupMatchStatus: LoadMatchStatus;
  matchLifecycleStage: MatchLifecycleStage;
  resetLiveMatchNavigationOwner: () => void;
  setForceOpenActiveMatch: Dispatch<SetStateAction<boolean>>;
  setIsResolvingFocusedMatch: Dispatch<SetStateAction<boolean>>;
  wedgedLoadingWatchdogRef: MutableRefObject<{ episodeKey: string | null; rearmedAtMs: number | null; dropped: boolean }>;
};

// Wedged-loading watchdog (B2c): a back-to-back match #2 can get pinned in the LIVE
// loading shell when the previous match left a stale mount latch / navigation-owner
// record (the resets in B2a/B2b are the primary fix; this is the belt-and-suspenders
// self-recovery so a wedge can never require an app relaunch — closes #198/#200).
//
// It fires ONLY while shellKind==='live' AND isResolvingFocusedMatch is true AND the
// focused match has NO confirmed mount, continuously for ~9s. A legitimately-mounting
// arena (a normal slow match-2 entry that mounts at ~5-7s) sets the mount confirmation
// and trips the early-return below, so it never fires. The watchdog never resurrects a
// forfeited match: it only clears a mount latch + navigation record and re-arms polling
// for the focused matchId; loadDuel/GroupMatchStatus still drop payloads for any matchId
// in forfeitedMatchIdsRef.
export function useTrackRunWedgedLoadingWatchdog({
  activeDuelSlotStartAt,
  activeGroupSlotStartAt,
  hydratedFocusMatchMode,
  isMountedRef,
  isResolvingFocusedMatch,
  liveMatchMountedRef,
  liveMatchViewConfirmationRef,
  liveShellGateDecision,
  loadDuelMatchStatus,
  loadGroupMatchStatus,
  matchLifecycleStage,
  resetLiveMatchNavigationOwner,
  setForceOpenActiveMatch,
  setIsResolvingFocusedMatch,
  wedgedLoadingWatchdogRef,
}: UseTrackRunWedgedLoadingWatchdogInput) {
  const watchdogFocusMatchId = liveShellGateDecision.routeMatchId;
  const watchdogFocusMode = hydratedFocusMatchMode === 'duel' || hydratedFocusMatchMode === 'group'
    ? hydratedFocusMatchMode
    : null;
  const watchdogShellIsLiveLoading = liveShellGateDecision.shellKind === 'live' && isResolvingFocusedMatch;
  // Route the (non-memoized) status loaders through a ref so the watchdog effect does not
  // list them as deps — otherwise it would re-create (and re-arm the 9s timer) every render
  // and break the one-shot-per-episode guarantee.
  const watchdogLoadersRef = useRef({ loadDuelMatchStatus, loadGroupMatchStatus });
  watchdogLoadersRef.current = { loadDuelMatchStatus, loadGroupMatchStatus };
  // Mirror the lifecycle stage through a ref so the in-timer stillWedged() can re-check it
  // without listing matchLifecycleController.stage as an effect dep (which would re-arm the
  // 9s timer every render). A confirmed-live/active stage means an arena exists via a signal
  // path other than the mount latches, so it must count as "has mount" (never wedged).
  const watchdogLifecycleStageRef = useRef(matchLifecycleStage);
  watchdogLifecycleStageRef.current = matchLifecycleStage;
  const watchdogFocusStageIsLive = isLiveLifecycleStage(matchLifecycleStage);
  const watchdogFocusHasMount = Boolean(
    watchdogFocusMatchId
    && (
      watchdogFocusStageIsLive
      || (liveMatchMountedRef.current?.matchId === watchdogFocusMatchId)
      || (
        liveMatchViewConfirmationRef.current.showLiveArena
        && liveMatchViewConfirmationRef.current.matchId === watchdogFocusMatchId
      )
    ),
  );
  useEffect(() => {
    const watchdog = wedgedLoadingWatchdogRef.current;

    // The arena is legitimately mounted/resolved (or there is no live-loading episode):
    // close any open episode so the one-shot stages re-arm for a future wedge, and bail.
    if (!watchdogShellIsLiveLoading || !watchdogFocusMatchId || !watchdogFocusMode || watchdogFocusHasMount) {
      watchdog.episodeKey = null;
      watchdog.rearmedAtMs = null;
      watchdog.dropped = false;
      return undefined;
    }

    const episodeKey = `${watchdogFocusMode}:${watchdogFocusMatchId}`;
    if (watchdog.episodeKey !== episodeKey) {
      watchdog.episodeKey = episodeKey;
      watchdog.rearmedAtMs = null;
      watchdog.dropped = false;
    }

    const WEDGED_LOADING_WATCHDOG_WINDOW_MS = 9000;
    let cancelled = false;
    let cleanupSecondStage: (() => void) | null = null;

    const stillWedged = () =>
      Boolean(
        watchdog.episodeKey === episodeKey
        && !isLiveLifecycleStage(watchdogLifecycleStageRef.current)
        && !(
          (liveMatchMountedRef.current?.matchId === watchdogFocusMatchId)
          || (
            liveMatchViewConfirmationRef.current.showLiveArena
            && liveMatchViewConfirmationRef.current.matchId === watchdogFocusMatchId
          )
        ),
      );

    const reloadFocusedStatus = () => {
      // The status loaders await network → setDuel/GroupMatchStatus; skip after unmount so
      // the watchdog re-arm never triggers a setState-on-unmounted-component warning/leak.
      if (!isMountedRef.current) {
        return;
      }
      const loaders = watchdogLoadersRef.current;
      if (watchdogFocusMode === 'duel') {
        void loaders.loadDuelMatchStatus(activeDuelSlotStartAt, { matchId: watchdogFocusMatchId, forceAccept: true }).catch(() => {});
      } else {
        void loaders.loadGroupMatchStatus(activeGroupSlotStartAt, { matchId: watchdogFocusMatchId, forceAccept: true }).catch(() => {});
      }
    };

    const firstStageTimeout = setTimeout(() => {
      if (cancelled || !stillWedged()) {
        return;
      }
      // Stage 1 (one-shot per episode): clear the stale mount latch + navigation-owner
      // record (drops any 'failed'/suppressed record), then re-arm polling so status can
      // reach live and the arena gate can open.
      unmarkLiveMatchMounted({ matchId: watchdogFocusMatchId, mode: watchdogFocusMode });
      resetLiveMatchNavigationOwner();
      rgPerfMark('wedged live loading watchdog re-armed', {
        matchId: watchdogFocusMatchId,
        mode: watchdogFocusMode,
      });
      watchdog.rearmedAtMs = Date.now();
      reloadFocusedStatus();

      const secondStageTimeout = setTimeout(() => {
        if (cancelled || watchdog.dropped || !stillWedged()) {
          return;
        }
        // Stage 2 (final, one-shot): still unresolved after a second window — drop the
        // LIVE loading shell back to the resolved/ready state locally (no server reset,
        // no finished-match revival) so the user is never pinned on the loading shell.
        watchdog.dropped = true;
        rgPerfMark('wedged live loading watchdog dropped shell', {
          matchId: watchdogFocusMatchId,
          mode: watchdogFocusMode,
        });
        setIsResolvingFocusedMatch(false);
        setForceOpenActiveMatch(false);
      }, WEDGED_LOADING_WATCHDOG_WINDOW_MS);

      // Chain the second timeout into cleanup via the outer cancelled flag + ref.
      cleanupSecondStage = () => clearTimeout(secondStageTimeout);
    }, WEDGED_LOADING_WATCHDOG_WINDOW_MS);

    return () => {
      cancelled = true;
      clearTimeout(firstStageTimeout);
      cleanupSecondStage?.();
    };
    // This dep array is byte-identical to the pre-extraction original. The lint warns only
    // because the four refs (isMountedRef, liveMatchMountedRef, liveMatchViewConfirmationRef,
    // wedgedLoadingWatchdogRef) arrive as params, so it can no longer see they are
    // identity-stable refs. Do NOT "fix" by adding the loaders or the lifecycle stage either —
    // that would re-arm the watchdog timer on every render, which is exactly what the
    // mirror-ref pattern above exists to prevent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeDuelSlotStartAt,
    activeGroupSlotStartAt,
    resetLiveMatchNavigationOwner,
    setForceOpenActiveMatch,
    setIsResolvingFocusedMatch,
    watchdogFocusHasMount,
    watchdogFocusMatchId,
    watchdogFocusMode,
    watchdogShellIsLiveLoading,
  ]);
}
