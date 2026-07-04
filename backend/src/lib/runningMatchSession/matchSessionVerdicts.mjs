import { MATCH_DUEL_FINISH_FALLBACK_MS } from '../matchConstants.mjs';
import { buildProgressAveragePaceLabel } from '../matchFormatting.mjs';
import {
  sealDuelFallbackResolutionIfElapsed,
  sealGroupFallbackResolutionIfElapsed,
} from './matchSessionFallbackSeals.mjs';

// The authoritative pace for each side is derived from the SAME official numbers
// (goal distance over the runner's frozen finishElapsedSeconds for a finisher, the
// official average pace otherwise) so the two paces can never diverge per device.
function resolveDuelVerdictPaceLabel(standing, goalDistanceKm) {
  if (!standing) {
    return null;
  }

  if (Number.isInteger(standing.finishElapsedSeconds) && standing.finishElapsedSeconds > 0) {
    return buildProgressAveragePaceLabel(goalDistanceKm, standing.finishElapsedSeconds);
  }

  return typeof standing.officialAveragePace === 'string' && standing.officialAveragePace.trim()
    ? standing.officialAveragePace
    : null;
}

// Single source of truth for a 1:1 duel result. Derived purely from the official
// standings (already ranked by MEASURED finishElapsedSeconds) so both phones read
// the identical verdict. Resolves only when BOTH finishes landed, OR a runner
// forfeits, OR the §B4 fallback window elapsed after the first finish (missing
// runner = DNF) — never strands a client on 'pending' forever. Once the §B4 fallback
// resolves, it is SEALED on the session (F4) so a later finish push can neither
// reopen nor flip it, and both phones read the identical sealed verdict.
export function buildDuelVerdict(session, standings, currentUserId, now = new Date()) {
  if (!session || session.mode !== 'duel' || !Array.isArray(standings) || standings.length !== 2) {
    return null;
  }

  const goalDistanceKm = session.distanceKm;
  const mine = standings.find((standing) => standing.userId === currentUserId) ?? null;
  const opponent = standings.find((standing) => standing.userId !== currentUserId) ?? null;

  if (!mine || !opponent) {
    return null;
  }

  const myFinishElapsedSeconds = Number.isInteger(mine.finishElapsedSeconds) ? mine.finishElapsedSeconds : null;
  const opponentFinishElapsedSeconds = Number.isInteger(opponent.finishElapsedSeconds)
    ? opponent.finishElapsedSeconds
    : null;
  const myFinished = myFinishElapsedSeconds !== null;
  const opponentFinished = opponentFinishElapsedSeconds !== null;
  const myForfeited = mine.liveStatus === 'forfeited';
  const opponentForfeited = opponent.liveStatus === 'forfeited';

  // §B4 fallback: if exactly one runner has finished, give the other a bounded
  // window (measured from the earliest finish receipt) to land their own finish.
  // After it elapses, resolve server-side treating the missing runner as a DNF.
  const finishReceiptMsList = [mine.finishedAt, opponent.finishedAt]
    .map((value) => (typeof value === 'string' ? Date.parse(value) : NaN))
    .filter((value) => Number.isFinite(value));
  const earliestFinishMs = finishReceiptMsList.length ? Math.min(...finishReceiptMsList) : NaN;
  const fallbackElapsed = Number.isFinite(earliestFinishMs)
    && now.getTime() - earliestFinishMs >= MATCH_DUEL_FINISH_FALLBACK_MS;

  const anyForfeit = myForfeited || opponentForfeited;
  const bothFinished = myFinished && opponentFinished;

  // F4: seal the fallback resolution the FIRST time the window elapses with a missing
  // finish (sealing from the raw, authoritative participant state). Thereafter the
  // sealed result is read straight back, identical for both perspectives.
  const sealed = sealDuelFallbackResolutionIfElapsed(session, now);

  if (sealed) {
    const iWon = sealed.winnerUserId === currentUserId;
    return {
      resolved: true,
      // PROVISIONAL until the revision window closes (sealFinalizedAt is stamped by the sweep's
      // finalization phase): inside the window the sealed-DNF runner's plausible late finish may
      // still annul the seal and flip this verdict (at most once). Additive — old clients ignore.
      provisional: !session.sealFinalizedAt,
      winnerUserId: sealed.winnerUserId,
      outcome: iWon ? 'win' : 'lose',
      // The DNF side carries no official finish elapsed — keep it null on both phones.
      myFinishElapsedSeconds: sealed.dnfUserId === currentUserId ? null : myFinishElapsedSeconds,
      opponentFinishElapsedSeconds: sealed.dnfUserId === currentUserId ? opponentFinishElapsedSeconds : null,
      myPaceLabel: sealed.dnfUserId === currentUserId ? null : resolveDuelVerdictPaceLabel(mine, goalDistanceKm),
      opponentPaceLabel: sealed.dnfUserId === currentUserId ? resolveDuelVerdictPaceLabel(opponent, goalDistanceKm) : null,
    };
  }

  const oneFinished = myFinished || opponentFinished;
  const resolved = bothFinished || anyForfeit || (oneFinished && fallbackElapsed);

  let outcome = 'pending';
  let winnerUserId = null;

  if (resolved) {
    // officialRank already encodes measured-elapsed order, forfeit-below ordering,
    // and the deterministic dead-heat tie-break — read the winner straight from it.
    const exactDeadHeat = bothFinished
      && myFinishElapsedSeconds === opponentFinishElapsedSeconds;

    if (exactDeadHeat) {
      outcome = 'draw';
      winnerUserId = null;
    } else {
      winnerUserId = mine.officialRank === 1 ? mine.userId : opponent.userId;
      outcome = winnerUserId === currentUserId ? 'win' : 'lose';
    }
  }

  // REVISED: a §B4 seal was annulled by the sealed-DNF runner's accepted late finish and the
  // re-resolved winner actually CHANGED from the provisionally shown one (a slower late finish
  // keeps the winner — no flag; a flip or a dead-heat downgrade of the shown win sets it).
  // Additive — old clients ignore both fields.
  const revision = session.duelFallbackRevision;
  const revised = resolved
    && revision?.previousWinnerUserId
    && revision.previousWinnerUserId !== winnerUserId
    ? true
    : undefined;

  return {
    resolved,
    winnerUserId,
    outcome,
    myFinishElapsedSeconds,
    opponentFinishElapsedSeconds,
    myPaceLabel: resolveDuelVerdictPaceLabel(mine, goalDistanceKm),
    opponentPaceLabel: resolveDuelVerdictPaceLabel(opponent, goalDistanceKm),
    ...(revised ? { revised: true, revisedAt: revision.revisedAt } : {}),
  };
}


// Single source of truth for a GROUP match's FINAL placement — the parity twin of
// buildDuelVerdict. Derived purely from the official standings (already ranked by the
// MEASURED finishElapsedSeconds, with forfeited ordered below finishers and the same
// deterministic dead-heat tie-break), so every phone reads the IDENTICAL ordering and a
// not-yet-synced / screen-off rival never produces a divergent LOCAL placement. No new
// ranking rules are invented: the placement is read straight off standing.officialRank.
//
// Resolution mirrors the duel's "never strand on pending forever" contract, generalised
// to N runners: the group resolves when EVERY participant is terminal (finished or
// forfeited), OR — once at least one runner has finished — when the §B4 fallback window
// (MATCH_DUEL_FINISH_FALLBACK_MS, measured from the earliest finish receipt) has elapsed,
// treating any still-unfinished runner as a DNF ranked after the finishers. Until then it
// stays unresolved (resolved=false) so the client renders a PENDING placeholder rather
// than a fabricated final rank.
//
// Returns { resolved, participants: [{ userId, rank, finishElapsedSeconds, paceLabel,
// forfeited, finished }], myRank } — additive/optional in the response so an older client
// ignores it safely. `myRank` is the resolved placement for currentUserId (null if absent
// or unresolved).
export function buildGroupVerdict(session, standings, currentUserId, now = new Date()) {
  if (!session || session.mode !== 'group' || !Array.isArray(standings) || standings.length < 2) {
    return null;
  }

  const goalDistanceKm = session.distanceKm;

  // Each runner's terminal state read from the SAME standings the live route uses.
  const projected = standings.map((standing) => {
    const finishElapsedSeconds = Number.isInteger(standing.finishElapsedSeconds)
      ? standing.finishElapsedSeconds
      : null;
    return {
      userId: standing.userId,
      officialRank: Number.isInteger(standing.officialRank) ? standing.officialRank : null,
      finishElapsedSeconds,
      finished: finishElapsedSeconds !== null,
      forfeited: standing.liveStatus === 'forfeited',
      finishedAt: typeof standing.finishedAt === 'string' ? standing.finishedAt : null,
      paceLabel: resolveDuelVerdictPaceLabel(standing, goalDistanceKm),
    };
  });

  const everyoneTerminal = projected.every((entry) => entry.finished || entry.forfeited);
  const anyFinished = projected.some((entry) => entry.finished);

  // §B4 fallback (generalised): once the first finish has landed, give the rest a bounded
  // window to record their own finish; after it elapses, resolve server-side and treat the
  // missing runners as DNF (already ranked below finishers by buildOfficialSessionStandings).
  const finishReceiptMsList = projected
    .map((entry) => (entry.finishedAt ? Date.parse(entry.finishedAt) : NaN))
    .filter((value) => Number.isFinite(value));
  const earliestFinishMs = finishReceiptMsList.length ? Math.min(...finishReceiptMsList) : NaN;
  const fallbackElapsed = Number.isFinite(earliestFinishMs)
    && now.getTime() - earliestFinishMs >= MATCH_DUEL_FINISH_FALLBACK_MS;

  // F4 (group parity): seal the fallback resolution the FIRST time the window elapses with a
  // missing finish — exactly like buildDuelVerdict calls sealDuelFallbackResolutionIfElapsed.
  // Once sealed, the order is read straight back (sticky): a later/faster finish from a
  // sealed-DNF runner can NEVER reorder above the sealed finishers, so two devices can no
  // longer persist conflicting placements.
  const sealed = sealGroupFallbackResolutionIfElapsed(session, now);

  if (sealed) {
    // Honor the SEALED order: finishers in their frozen finish order first, then every
    // sealed-DNF participant below them (in seal-recorded order). A sealed-DNF entry is
    // forced to finished=false / finishElapsedSeconds=null so a late finish push that slipped
    // a finishElapsedSeconds onto the participant can't resurrect them above the finishers.
    const finisherRank = new Map(sealed.finisherUserIds.map((userId, index) => [userId, index + 1]));
    const dnfRank = new Map(sealed.dnfUserIds.map((userId, index) => [userId, sealed.finisherUserIds.length + index + 1]));
    const byUserId = new Map(projected.map((entry) => [entry.userId, entry]));

    const sealedParticipants = [...sealed.finisherUserIds, ...sealed.dnfUserIds].map((userId) => {
      const entry = byUserId.get(userId);
      const isDnf = dnfRank.has(userId);
      return {
        userId,
        rank: finisherRank.get(userId) ?? dnfRank.get(userId) ?? null,
        finishElapsedSeconds: isDnf ? null : entry?.finishElapsedSeconds ?? null,
        paceLabel: isDnf ? null : entry?.paceLabel ?? null,
        forfeited: Boolean(entry?.forfeited),
        finished: !isDnf,
      };
    });

    const mineSealed = sealedParticipants.find((entry) => entry.userId === currentUserId) ?? null;

    return {
      resolved: true,
      // PROVISIONAL until the revision window closes (sealFinalizedAt) — mirrors the duel: a
      // sealed-DNF runner's plausible late finish may still annul + deterministically re-seal
      // this ordering within the window. Additive — old clients ignore it.
      provisional: !session.sealFinalizedAt,
      participants: sealedParticipants,
      myRank: mineSealed && Number.isInteger(mineSealed.rank) ? mineSealed.rank : null,
    };
  }

  const resolved = everyoneTerminal || (anyFinished && fallbackElapsed);

  // Resolved placement reads straight off the standings rank — never recomputed. Unresolved
  // entries still expose the live rank so the response is shape-stable, but `resolved=false`
  // tells the client to hold the PENDING placeholder instead of trusting it as final.
  const participants = projected.map((entry) => ({
    userId: entry.userId,
    rank: entry.officialRank,
    finishElapsedSeconds: entry.finishElapsedSeconds,
    paceLabel: entry.paceLabel,
    forfeited: entry.forfeited,
    finished: entry.finished,
  }));

  const mine = participants.find((entry) => entry.userId === currentUserId) ?? null;

  return {
    resolved,
    participants,
    myRank: resolved && mine && Number.isInteger(mine.rank) ? mine.rank : null,
  };
}
