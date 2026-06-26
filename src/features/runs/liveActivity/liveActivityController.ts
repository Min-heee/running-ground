import type {
  GroupMatchParticipant,
  RunningMatchStatusResponse,
} from '@/lib/api/types';
import {
  endLiveActivity,
  isLiveActivityAvailable,
  startLiveActivity,
  updateLiveActivity,
} from '../../../../modules/live-activity';
import {
  buildLiveCardState,
  type LiveCardBoardRunner,
} from './buildLiveCardState';

// FIRE-AND-FORGET orchestration layer between the run/match runtime and the Live Activity native
// bridge. EVERY entry point here first checks isLiveActivityAvailable() (false on every current
// binary), so on production today every call is a guaranteed no-op — nothing is started, updated,
// or ended, and no exception can escape. This is what keeps the OTA bundle safe before the native
// target ships.
//
// CRITICAL (bg-sync invariant): these functions are called WITHOUT await, off the existing sync
// path's awaited promise / throttle / inflight guards. They never return a value the caller waits
// on and never throw, so they cannot perturb backgroundMatchProgressSync's single-flight bg-sync
// hardening.

// Module-scoped flag so an update before a start is a safe no-op, and a second start is idempotent.
// Reset on end. iOS-only; on Android (and current iOS binaries) isLiveActivityAvailable() is false
// so this never flips.
let liveActivityStarted = false;

function safe(run: () => void): void {
  try {
    run();
  } catch {
    // Best-effort: the Live Activity is a non-essential lock-screen affordance. A failure here must
    // never bubble into the run/match flow.
  }
}

// Identify "me" + extract a single current distance per group participant. Prefer the official
// frozen distance once ready, else the live distance. `mySeedRank` (the response's mySeedRank)
// marks which participant is the current user.
function buildGroupBoard(
  participants: GroupMatchParticipant[],
  mySeedRank: number | undefined,
): LiveCardBoardRunner[] {
  const meSeedRank = mySeedRank ?? 1;
  return participants.map((participant) => ({
    name: participant.name,
    distanceKm: participant.officialReady && typeof participant.officialDistanceKm === 'number'
      ? participant.officialDistanceKm
      : participant.liveDistanceKm ?? 0,
    isMe: participant.seedRank === meSeedRank,
  }));
}

// Build the match board (duel or group) from a status response + my own current distance/name.
// Returns [] when there is no usable opponent/participant data yet (the card then renders the
// solo-shaped time/distance/pace, which buildLiveCardState handles for an empty board).
export function buildBoardFromMatchStatus(
  status: RunningMatchStatusResponse,
  myDistanceKm: number,
  myName: string,
): LiveCardBoardRunner[] {
  if (status.mode === 'group') {
    const participants = status.participants ?? [];
    if (participants.length === 0) {
      return [];
    }
    return buildGroupBoard(participants, status.mySeedRank);
  }

  // duel
  const opponent = status.opponent;
  if (!opponent) {
    return [];
  }
  const opponentDistanceKm = opponent.officialReady && typeof opponent.officialDistanceKm === 'number'
    ? opponent.officialDistanceKm
    : opponent.liveDistanceKm ?? 0;
  return [
    { name: myName, distanceKm: myDistanceKm, isMe: true },
    { name: opponent.name, distanceKm: opponentDistanceKm, isMe: false },
  ];
}

export type LiveActivityRunContext = {
  mode: 'solo' | 'duel' | 'group';
  matchId?: string;
  goalDistanceKm?: number;
  startedAt: string;
  // Display name for the current user on the match rank bar (ignored for solo).
  myName: string;
};

// Start the card when a run/match begins. Idempotent + guarded; no-op on current binaries.
export function startLiveActivityForRun(
  context: LiveActivityRunContext,
  initial: {
    distanceKm: number;
    elapsedSeconds: number;
    board?: LiveCardBoardRunner[];
    // Whether the run is actively counting at start. Defaults to true (a run always starts
    // running); threaded to the card so the native clock begins ticking immediately.
    isRunning?: boolean;
    // Wall-clock at this push, captured by the bridge so the pause-aware native timer anchor
    // (timerStartMs = nowMs − elapsedSeconds*1000) re-syncs to the real push instant. Defaults
    // to Date.now() so any caller that omits it still gets a sane anchor.
    nowMs?: number;
  },
): void {
  if (!isLiveActivityAvailable() || liveActivityStarted) {
    return;
  }

  safe(() => {
    const { attributes, contentState } = buildLiveCardState({
      mode: context.mode,
      matchId: context.matchId,
      goalDistanceKm: context.goalDistanceKm,
      startedAt: context.startedAt,
      distanceKm: initial.distanceKm,
      elapsedSeconds: initial.elapsedSeconds,
      board: initial.board,
      isRunning: initial.isRunning,
      nowMs: initial.nowMs ?? Date.now(),
    });
    startLiveActivity(attributes, contentState);
    liveActivityStarted = true;
  });
}

// SOLO update from a tracking snapshot. Fire-and-forget; no-op until a start + native ship.
export function updateLiveActivityForSolo(
  context: LiveActivityRunContext,
  snapshot: { distanceKm: number; elapsedSeconds: number; isRunning?: boolean; nowMs?: number },
): void {
  if (!isLiveActivityAvailable() || !liveActivityStarted) {
    return;
  }

  safe(() => {
    const { contentState } = buildLiveCardState({
      mode: 'solo',
      goalDistanceKm: context.goalDistanceKm,
      startedAt: context.startedAt,
      distanceKm: snapshot.distanceKm,
      elapsedSeconds: snapshot.elapsedSeconds,
      isRunning: snapshot.isRunning,
      // Re-anchor the pause-aware native timer to this push instant (see startLiveActivityForRun).
      nowMs: snapshot.nowMs ?? Date.now(),
    });
    updateLiveActivity(contentState);
  });
}

// MATCH update from a fresh status response (the live board source) + my own snapshot metrics.
// Called from the bg flush .then(nextStatus) handler and the foreground status appliers, always
// fire-and-forget. No-op until a start + native ship.
export function updateLiveActivityForMatch(
  context: LiveActivityRunContext,
  status: RunningMatchStatusResponse,
  mine: { distanceKm: number; elapsedSeconds: number; isRunning?: boolean; nowMs?: number },
): void {
  if (!isLiveActivityAvailable() || !liveActivityStarted) {
    return;
  }

  safe(() => {
    const board = buildBoardFromMatchStatus(status, mine.distanceKm, context.myName);
    const { contentState } = buildLiveCardState({
      mode: context.mode,
      matchId: context.matchId,
      goalDistanceKm: context.goalDistanceKm,
      startedAt: context.startedAt,
      distanceKm: mine.distanceKm,
      elapsedSeconds: mine.elapsedSeconds,
      board,
      isRunning: mine.isRunning,
      // Re-anchor the pause-aware native timer to this push instant (see startLiveActivityForRun).
      nowMs: mine.nowMs ?? Date.now(),
    });
    updateLiveActivity(contentState);
  });
}

// End + dismiss the card on run end / forfeit / unmount. Always safe to call; resets the started
// flag so a later run starts fresh. No-op on current binaries.
export function endLiveActivityForRun(): void {
  // Skip only when there is nothing to dismiss: the card was never started, OR the feature is
  // unavailable on this binary. End it whenever it WAS started on a capable binary (started=true
  // implies availability was true at start, and availability is static per-binary).
  if (!liveActivityStarted || !isLiveActivityAvailable()) {
    liveActivityStarted = false;
    return;
  }

  safe(() => {
    endLiveActivity();
  });
  liveActivityStarted = false;
}

// Test-only reset of the module-scoped started flag.
export function resetLiveActivityControllerForTest(): void {
  liveActivityStarted = false;
}
