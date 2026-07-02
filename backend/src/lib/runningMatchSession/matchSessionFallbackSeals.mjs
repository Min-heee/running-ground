import { MATCH_DUEL_FINISH_FALLBACK_MS } from '../matchConstants.mjs';
import { ensureMatchSessions } from './matchSessionCore.mjs';

// The saved-run back-fill lives in matchResultBuilders.mjs (it reuses the save-path resolvers,
// the single source of truth for a healed card). matchResultBuilders already imports THIS
// module, so to avoid a load-time import cycle the back-fill is INJECTED here via a setter that
// matchResultBuilders calls at module init. Until it is registered the sweep still seals the
// fallback (the load-bearing persistence step); the back-fill is a best-effort display heal.
let backFillFinisherSavedRunsImpl = null;

export function registerFinisherSavedRunBackfill(impl) {
  backFillFinisherSavedRunsImpl = typeof impl === 'function' ? impl : null;
}

// One-finisher (DNF) self-heal sweep, run from the periodic prune so a stuck match resolves
// even when nobody opens the result screen. For EVERY live session whose §B4 fallback window
// has elapsed with one finisher and a missing finish, this seals the fallback (sealDuel/
// GroupFallbackResolutionIfElapsed — idempotent + sticky; never seals a match still
// legitimately running inside the window, a forfeit-only match, or an already-sealed one) and
// back-fills the finisher's SAVED run so the 기록상세 card heals. The back-fill is the injected
// resolver-backed impl (registerFinisherSavedRunBackfill). Returns true if anything was
// sealed or healed.
export function sweepStuckMatchSessionFallbacks(store, now = new Date()) {
  const sessions = ensureMatchSessions(store);
  if (!sessions.length) {
    return false;
  }

  let changed = false;

  for (const session of sessions) {
    if (!session || (session.mode !== 'duel' && session.mode !== 'group')) {
      continue;
    }

    const sealed = session.mode === 'duel'
      ? sealDuelFallbackResolutionIfElapsed(session, now)
      : sealGroupFallbackResolutionIfElapsed(session, now);
    const alreadySealed = session.mode === 'duel'
      ? session.duelFallbackResolution
      : session.groupFallbackResolution;

    // Only a (now or previously) sealed one-finisher match needs a saved-run back-fill. A match
    // that did not seal (still inside the window, forfeit-only, both-finished) is left untouched.
    if (!sealed && !alreadySealed) {
      continue;
    }

    if (sealed) {
      changed = true;
    }

    if (typeof backFillFinisherSavedRunsImpl === 'function' && backFillFinisherSavedRunsImpl(store, session, now)) {
      changed = true;
    }
  }

  return changed;
}

// F4: a runner the server sealed as the DNF side of a fallback resolution must never
// be allowed to record a finish afterward (it would otherwise flip the sealed verdict).
export function isParticipantSealedDnf(session, userId) {
  return Boolean(session?.duelFallbackResolution && session.duelFallbackResolution.dnfUserId === userId);
}

// F4: seal the §B4 fallback resolution directly from raw participant state, independent
// of the per-perspective standings projection. The finish handler calls this BEFORE it
// freezes a finish so a late finish push from the missing runner — even if it is the very
// FIRST request to arrive after the window elapsed (no poll has sealed yet) — is correctly
// blocked. Once sealed it is never recomputed (sticky), so the verdict can never flip.
export function sealDuelFallbackResolutionIfElapsed(session, now = new Date()) {
  if (!session || session.mode !== 'duel' || session.duelFallbackResolution) {
    return session?.duelFallbackResolution ?? null;
  }

  const participants = Array.isArray(session.participants) ? session.participants : [];
  if (participants.length !== 2) {
    return null;
  }

  const [a, b] = participants;
  const aFinished = Number.isInteger(a.finishElapsedSeconds) && a.finishElapsedSeconds > 0;
  const bFinished = Number.isInteger(b.finishElapsedSeconds) && b.finishElapsedSeconds > 0;
  const anyForfeit = a.liveStatus === 'forfeited' || b.liveStatus === 'forfeited';

  // Only the clear one-finisher / one-missing case is sealed here. Forfeits and both-
  // finished are already deterministic, so they need no seal.
  if (anyForfeit || aFinished === bFinished) {
    return null;
  }

  const finisher = aFinished ? a : b;
  const missing = aFinished ? b : a;
  const finisherFinishMs = Date.parse(typeof finisher.finishedAt === 'string' ? finisher.finishedAt : '');
  if (!Number.isFinite(finisherFinishMs)) {
    return null;
  }

  if (now.getTime() - finisherFinishMs < MATCH_DUEL_FINISH_FALLBACK_MS) {
    return null;
  }

  session.duelFallbackResolution = {
    resolvedAt: now.toISOString(),
    winnerUserId: finisher.userId,
    dnfUserId: missing.userId,
  };
  return session.duelFallbackResolution;
}

// F4 (group parity): a runner the server sealed as a DNF side of a GROUP §B4 fallback
// resolution must never be allowed to record a finish afterward — generalises
// isParticipantSealedDnf to N runners. Reads the sticky groupFallbackResolution written
// by sealGroupFallbackResolutionIfElapsed; returns true only for a participant frozen as
// DNF-below-finishers.
export function isParticipantGroupSealedDnf(session, userId) {
  return Boolean(
    session?.groupFallbackResolution
      && Array.isArray(session.groupFallbackResolution.dnfUserIds)
      && session.groupFallbackResolution.dnfUserIds.includes(userId),
  );
}

// F4 (group parity): seal the §B4 fallback resolution for a GROUP directly from raw
// participant state — the N-runner twin of sealDuelFallbackResolutionIfElapsed. Once the
// SAME §B4 window (MATCH_DUEL_FINISH_FALLBACK_MS, measured from the earliest group finish
// receipt) has elapsed with at least one finisher and at least one runner still missing a
// finish, this FREEZES the current ordering: the runners who have finished are locked in
// their MEASURED finish-elapsed order (the finishers list), and every not-yet-finished
// participant is locked as a DNF ranked BELOW all sealed finishers (the dnfUserIds list).
// Written exactly once (sticky): if groupFallbackResolution already exists, or the window
// has not elapsed, or every participant is already terminal (no missing finisher to strand
// — the deterministic all-done path needs no seal), it is a no-op. The finish handler calls
// this BEFORE it freezes a finish so a late finish from a sealed-DNF runner — even the FIRST
// request to arrive after the window elapsed — is correctly blocked, exactly like the duel.
export function sealGroupFallbackResolutionIfElapsed(session, now = new Date()) {
  if (!session || session.mode !== 'group' || session.groupFallbackResolution) {
    return session?.groupFallbackResolution ?? null;
  }

  const participants = Array.isArray(session.participants) ? session.participants : [];
  if (participants.length < 2) {
    return null;
  }

  const isFinished = (participant) => Number.isInteger(participant.finishElapsedSeconds)
    && participant.finishElapsedSeconds > 0;
  const isForfeited = (participant) => participant.liveStatus === 'forfeited';

  const finishers = participants.filter(isFinished);
  if (finishers.length === 0) {
    return null;
  }

  // Every participant already terminal (finished or forfeited) → deterministic all-done
  // path, no missing finisher to strand → no seal needed (mirrors the duel only sealing the
  // clear one-finisher / one-missing case).
  const allTerminal = participants.every((participant) => isFinished(participant) || isForfeited(participant));
  if (allTerminal) {
    return null;
  }

  // The §B4 window is measured from the EARLIEST finish receipt — identical to the duel and
  // to buildGroupVerdict's live fallback gate.
  const finishReceiptMsList = finishers
    .map((participant) => Date.parse(typeof participant.finishedAt === 'string' ? participant.finishedAt : ''))
    .filter((value) => Number.isFinite(value));
  const earliestFinishMs = finishReceiptMsList.length ? Math.min(...finishReceiptMsList) : NaN;
  if (!Number.isFinite(earliestFinishMs)) {
    return null;
  }

  if (now.getTime() - earliestFinishMs < MATCH_DUEL_FINISH_FALLBACK_MS) {
    return null;
  }

  // Freeze the sealed finisher order by MEASURED finish elapsed asc (the same rank key the
  // standings sort uses), with finishedAt then seedRank as the deterministic dead-heat
  // tie-break — so the sealed order is byte-stable and matches buildOfficialSessionStandings.
  const sealedFinishers = [...finishers].sort((left, right) => {
    if (left.finishElapsedSeconds !== right.finishElapsedSeconds) {
      return left.finishElapsedSeconds - right.finishElapsedSeconds;
    }
    const leftFinishedMs = Date.parse(typeof left.finishedAt === 'string' ? left.finishedAt : '');
    const rightFinishedMs = Date.parse(typeof right.finishedAt === 'string' ? right.finishedAt : '');
    const leftValue = Number.isFinite(leftFinishedMs) ? leftFinishedMs : Number.POSITIVE_INFINITY;
    const rightValue = Number.isFinite(rightFinishedMs) ? rightFinishedMs : Number.POSITIVE_INFINITY;
    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
    return (left.seedRank ?? 0) - (right.seedRank ?? 0);
  });

  // Every participant who is NOT a sealed finisher is locked as a DNF ranked below the
  // finishers — including a forfeiter (already below finishers by the standings sort) and any
  // still-running / stalled runner. A late/faster finish from any of these must NOT reorder.
  const finisherUserIds = new Set(sealedFinishers.map((participant) => participant.userId));
  const dnfUserIds = participants
    .filter((participant) => !finisherUserIds.has(participant.userId))
    .map((participant) => participant.userId);

  session.groupFallbackResolution = {
    resolvedAt: now.toISOString(),
    finisherUserIds: sealedFinishers.map((participant) => participant.userId),
    dnfUserIds,
  };
  return session.groupFallbackResolution;
}
