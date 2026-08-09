import { ApiError } from '../response/httpResponse.mjs';
import { parsePaceToMinutes } from './points.mjs';
import { applyRunIntegrityCheck, classifyRunIntegrity } from './runIntegrity.mjs';
import {
  buildDuelVerdict,
  buildGroupVerdict,
  buildOfficialSessionStandings,
  ensureMatchSessions,
  registerFinisherSavedRunBackfill,
  resolveSessionParticipantProfile,
} from './runningMatchSessionStoreHelpers.mjs';

// A RAW (non-pruning) lookup. The result endpoint must read a fully-resolved session
// (both runners finished) which findMatchSessionById/pruneMatchSessions would drop the
// instant every participant is "done with the match". The physical record is still in
// store.matchSessions for the brief window before the next mutating request prunes it,
// so reading it directly lets a just-finished match resolve from the live standings.
function findRawMatchSessionById(store, matchId) {
  if (!matchId) {
    return null;
  }

  return ensureMatchSessions(store).find((session) => session.id === matchId) ?? null;
}

// Server-authoritative duel win/lose copy. The verdict (buildDuelVerdict) is the ONE source
// of truth, so the saved card's title/badge are rebuilt from the verdict outcome here rather
// than trusting the client-supplied text.
function buildAuthoritativeDuelCopy(outcome, opponentName) {
  const name = typeof opponentName === 'string' && opponentName.trim() ? opponentName.trim() : '상대';

  if (outcome === 'win') {
    return { title: `${name}님을 이겼어요`, badgeLabel: '승리' };
  }

  if (outcome === 'lose') {
    return { title: `${name}님에게 졌어요`, badgeLabel: '패배' };
  }

  return { title: `${name}님과 비슷한 흐름으로 마쳤어요`, badgeLabel: '무승부' };
}

// C1/C2: at run save, the SERVER decides the duel win/lose — never the client.
//
// Given the client-supplied (validated) matchResult for a duel run carrying a matchId, this
// resolves the authoritative result against the live match session's buildDuelVerdict (ranked
// by MEASURED finishElapsedSeconds). It returns a NEW matchResult object:
//   - verdict RESOLVED (both finished / forfeit / §B4 fallback) → resultTone, opponentName,
//     opponentId, and opponent finish/pace are OVERWRITTEN from the verdict + opponent's own
//     user record, so both phones agree on one winner and the opponent name is the real
//     account name (not the viewer's device label).
//   - verdict NOT yet resolvable (opponent hasn't finished/synced) → a PENDING result:
//     resultTone/opponentDuration/gapKm stripped, a "결과 집계 중" badge, so it is NEVER a
//     wrong definite win. The client reconcile path fills the official verdict on re-query.
//
// Anything that is not a resolvable duel with a known session (group runs, missing session,
// missing matchId, forfeit-only records the validator already shaped) is returned UNCHANGED so
// no existing working case is altered. The §B4/forfeit verdicts already encode their outcome,
// so they resolve here exactly as the live arena resolves them.
export function resolveSavedDuelMatchResult(store, currentUser, matchResult, now = new Date()) {
  if (!matchResult || matchResult.mode !== 'duel') {
    return matchResult;
  }

  const matchId = typeof matchResult.matchId === 'string' ? matchResult.matchId.trim() : '';

  // No matchId → an old/standalone record with no server session to consult. Leave it exactly
  // as the client saved it (older clients that never sent matchId must keep saving fine).
  if (!matchId) {
    return matchResult;
  }

  const session = findRawMatchSessionById(store, matchId);

  // No live session → the session was pruned. The session is pruned as the NORMAL end-state of a
  // both-finished duel (the last finisher's /progress AND routine status/upcoming/room-sync polls
  // all prune it), so by the time the SECOND device lingers and saves, no session remains. We must
  // NOT trust the client's value here: a stale build or a crafted POST can carry a fabricated
  // resultTone:'win' for the slower finisher, which would persist and self-award +20P. Instead
  // reconstruct the verdict SERVER-side from the durable saved runs (the same source the GET
  // /result endpoint reconstructs a pruned duel from). A real matchId NEVER survives unverified.
  if (!session || session.mode !== 'duel') {
    return resolveDuelMatchResultFromSavedRuns(store, currentUser, matchId, matchResult);
  }

  // A requester who is not a participant of this match cannot have it resolve — leave the saved
  // value untouched (cannot server-resolve someone else's session for them).
  if (!session.participants.some((participant) => participant.userId === currentUser.id)) {
    return matchResult;
  }

  const standings = buildOfficialSessionStandings(store, session, now);
  const verdict = buildDuelVerdict(session, standings, currentUser.id, now);

  // A PROVISIONAL verdict (sealed, revision window still open) is display-only: it may still
  // flip once, and a persisted tone would trip the saved-run never-downgrade guard and block
  // the correction forever. Keep the blob PENDING; the finalization back-fill heals it.
  if (!verdict || !verdict.resolved || verdict.outcome === 'pending' || verdict.provisional === true) {
    return toPendingDuelMatchResult(matchResult);
  }

  const outcome = verdict.outcome;
  const opponentStanding = standings.find((standing) => standing.userId !== currentUser.id) ?? null;
  const opponentParticipant = opponentStanding
    ? session.participants.find((participant) => participant.userId === opponentStanding.userId) ?? null
    : null;
  const opponentProfile = opponentParticipant
    ? resolveSessionParticipantProfile(store, opponentParticipant)
    : null;
  const opponentName = (opponentProfile?.name ?? opponentStanding?.name ?? matchResult.opponentName ?? '상대');
  const opponentId = opponentStanding?.userId ?? undefined;
  const copy = buildAuthoritativeDuelCopy(outcome, opponentName);

  const myDurationSeconds = Number.isInteger(verdict.myFinishElapsedSeconds) && verdict.myFinishElapsedSeconds > 0
    ? verdict.myFinishElapsedSeconds
    : matchResult.myDurationSeconds;
  const opponentDurationSeconds = Number.isInteger(verdict.opponentFinishElapsedSeconds)
    && verdict.opponentFinishElapsedSeconds > 0
    ? verdict.opponentFinishElapsedSeconds
    : undefined;

  const resolved = {
    ...matchResult,
    title: copy.title,
    badgeLabel: copy.badgeLabel,
    resultTone: outcome,
    opponentName,
    ...(opponentId ? { opponentId } : {}),
    ...(typeof myDurationSeconds === 'number' ? { myDurationSeconds } : {}),
    ...(verdict.myPaceLabel ? { myPaceLabel: verdict.myPaceLabel } : {}),
    ...(typeof opponentDurationSeconds === 'number' ? { opponentDurationSeconds } : {}),
    ...(verdict.opponentPaceLabel ? { opponentPaceLabel: verdict.opponentPaceLabel } : {}),
  };

  // Strip a stale opponent pace/time the client may have guessed when the verdict has none for
  // that side (a §B4 DNF opponent carries no official finish) so the card never shows a
  // fabricated opponent number alongside the authoritative verdict.
  if (typeof opponentDurationSeconds !== 'number') {
    delete resolved.opponentDurationSeconds;
  }
  if (!verdict.opponentPaceLabel) {
    delete resolved.opponentPaceLabel;
  }

  return resolved;
}

// Server-authoritative GROUP final-placement copy — the parity twin of buildAuthoritativeDuelCopy.
// The verdict (buildGroupVerdict) decides the sealed rank, so the saved card's title/badge are
// rebuilt from that rank here rather than trusting the client-supplied text.
function buildAuthoritativeGroupCopy(rank, participantCount) {
  const safeCount = Number.isInteger(participantCount) && participantCount > 0 ? participantCount : null;

  if (rank === 1) {
    return { title: '1위로 마무리했어요', badgeLabel: '1위' };
  }

  return {
    title: safeCount ? `${safeCount}명 중 ${rank}위로 마쳤어요` : `${rank}위로 마쳤어요`,
    badgeLabel: `${rank}위`,
  };
}

// The PENDING group record: a group matchResult whose final placement is not yet sealed. It keeps
// the run's own measured pace/time but DROPS the rank-bearing field (rank) and carries a neutral
// "결과 집계 중" badge. Because rank is absent, getMatchBonusPoints awards 0 (no rank LP from a
// client-claimed placement) and the client's isUnresolvedGroupMatchResult treats it as reconcilable
// so the official placement fills in later. Mirrors toPendingDuelMatchResult.
function toPendingGroupMatchResult(matchResult) {
  const pending = { ...matchResult };
  delete pending.rank;
  delete pending.gapKm;
  pending.title = '그룹 결과를 집계하고 있어요';
  pending.summary = '다른 참가자가 완주하면 순위가 자동으로 업데이트돼요.';
  pending.badgeLabel = '결과 집계 중';
  return pending;
}

// A forfeit group record carries its OWN authoritative terminal state (a 기권 badge), exactly like
// the duel forfeit: the forfeiter's placement is deterministic and the validator already shaped it,
// so it must resolve from the saved/forfeit record itself — never be forced PENDING forever.
function isForfeitGroupMatchResult(matchResult) {
  return /기권/.test(String(matchResult?.badgeLabel ?? ''));
}

// C (group parity): at run save, the SERVER decides the group's final placement — never the client.
//
// Given the client-supplied (validated) matchResult for a group run carrying a matchId, this
// resolves the authoritative placement against the live session's buildGroupVerdict (ranked by the
// SAME official standings the duel uses). It returns a NEW matchResult object:
//   - verdict RESOLVED (every participant terminal, or §B4 fallback elapsed) → rank, title, badge
//     are OVERWRITTEN from the verdict's per-participant placement, so every phone agrees on one
//     sealed ordering and a screen-off rival can never yield a wrong LOCAL rank.
//   - verdict NOT yet resolvable (someone still running, fallback window open) → a PENDING result:
//     rank/gapKm stripped, a "결과 집계 중" badge, so it is NEVER a wrong definite placement. The
//     client reconcile path fills the official placement on re-query.
//
// Anything that is not a resolvable group with a known session (duel runs, missing session, missing
// matchId, forfeit records the validator already shaped) is returned UNCHANGED. When the session is
// pruned, the placement is reconstructed SERVER-side from the durable saved runs, mirroring the duel.
export function resolveSavedGroupMatchResult(store, currentUser, matchResult, now = new Date()) {
  if (!matchResult || matchResult.mode !== 'group') {
    return matchResult;
  }

  const matchId = typeof matchResult.matchId === 'string' ? matchResult.matchId.trim() : '';

  // No matchId → an old/standalone record with no server session to consult. Leave it as saved.
  if (!matchId) {
    return matchResult;
  }

  // A forfeit record is self-contained and already authoritative — keep it as saved.
  if (isForfeitGroupMatchResult(matchResult)) {
    return matchResult;
  }

  const session = findRawMatchSessionById(store, matchId);

  // No live session → the session was pruned (the normal all-done end-state). Reconstruct the
  // placement SERVER-side from the durable saved runs — never trust the client's claimed rank.
  if (!session || session.mode !== 'group') {
    return resolveGroupMatchResultFromSavedRuns(store, currentUser, matchId, matchResult);
  }

  // A requester who is not a participant cannot have it resolve — leave the saved value untouched.
  if (!session.participants.some((participant) => participant.userId === currentUser.id)) {
    return matchResult;
  }

  const standings = buildOfficialSessionStandings(store, session, now);
  const verdict = buildGroupVerdict(session, standings, currentUser.id, now);

  // A PROVISIONAL sealed placement (revision window still open) is display-only — never
  // persisted, exactly like the duel above. The finalization back-fill heals the blob.
  if (!verdict || !verdict.resolved || !Number.isInteger(verdict.myRank) || verdict.provisional === true) {
    return toPendingGroupMatchResult(matchResult);
  }

  const participantCount = session.participants.length;
  const copy = buildAuthoritativeGroupCopy(verdict.myRank, participantCount);
  const mine = verdict.participants.find((participant) => participant.userId === currentUser.id) ?? null;
  const myDurationSeconds = mine && Number.isInteger(mine.finishElapsedSeconds) && mine.finishElapsedSeconds > 0
    ? mine.finishElapsedSeconds
    : matchResult.myDurationSeconds;

  return {
    ...matchResult,
    title: copy.title,
    badgeLabel: copy.badgeLabel,
    rank: verdict.myRank,
    participantCount,
    ...(typeof myDurationSeconds === 'number' ? { myDurationSeconds } : {}),
    ...(mine?.paceLabel ? { myPaceLabel: mine.paceLabel } : {}),
  };
}

// NO-SESSION branch for a group save: the live session is gone (pruned as the normal all-done
// end-state), so the placement is reconstructed SERVER-side from the durable saved runs — the SAME
// source buildResultFromSavedRuns uses for the GET /result endpoint, so the save path and read path
// agree. The current run being saved is NOT yet in store.runs, so this device's own finish is read
// from the matchResult passed in and merged with the OTHER participants' saved runs.
//   - Until EVERY known participant has saved a run, the group is not yet fully settled from runs →
//     PENDING (no rank, no LP). The reconcile path / a later GET upgrades it once the rest land.
//   - Once all participants' runs exist, rank by their measured finish elapsed (finishers asc; a
//     run without a usable finish sinks to the bottom) and seal this device's placement.
// The client's claimed rank is NEVER trusted for a real matchId.
function resolveGroupMatchResultFromSavedRuns(store, currentUser, matchId, matchResult) {
  const savedRunsByUserId = collectSavedMatchRuns(store, matchId);

  // Build the full finisher roster: every OTHER participant's saved run + this device's own
  // in-flight save (not yet in store.runs). The expected participant count is the client-reported
  // participantCount when present, else the number of distinct saved runs + this device.
  const myFinishElapsedSeconds = finishElapsedFromSavedRun(matchResult, null);
  const otherEntries = [...savedRunsByUserId.entries()].filter(([userId]) => userId !== currentUser.id);

  const reportedCount = Number.isInteger(matchResult.participantCount) && matchResult.participantCount > 1
    ? matchResult.participantCount
    : null;
  const knownCount = otherEntries.length + 1;

  // Not every participant has saved yet → we cannot seal the final ordering. Stay PENDING rather
  // than trust a client rank (a partial roster must never resolve to a self-claimed placement).
  if (reportedCount !== null && knownCount < reportedCount) {
    return toPendingGroupMatchResult(matchResult);
  }

  // Without this device's own measured finish we cannot place it — stay PENDING.
  if (myFinishElapsedSeconds === null) {
    return toPendingGroupMatchResult(matchResult);
  }

  const roster = [
    { userId: currentUser.id, finishElapsedSeconds: myFinishElapsedSeconds, isMe: true },
    ...otherEntries.map(([userId, run]) => ({
      userId,
      finishElapsedSeconds: finishElapsedFromSavedRun(run.matchResult ?? {}, run),
      isMe: false,
    })),
  ];

  // Rank by measured finish elapsed asc; a missing finish sinks to the bottom (DNF after finishers),
  // mirroring buildOfficialSessionStandings' finisher-first ordering.
  roster.sort((left, right) => {
    const leftHas = Number.isInteger(left.finishElapsedSeconds);
    const rightHas = Number.isInteger(right.finishElapsedSeconds);
    if (leftHas !== rightHas) {
      return leftHas ? -1 : 1;
    }
    if (leftHas && rightHas && left.finishElapsedSeconds !== right.finishElapsedSeconds) {
      return left.finishElapsedSeconds - right.finishElapsedSeconds;
    }
    return 0;
  });

  const myRank = roster.findIndex((entry) => entry.isMe) + 1;
  const participantCount = roster.length;
  const copy = buildAuthoritativeGroupCopy(myRank, participantCount);

  return {
    ...matchResult,
    title: copy.title,
    badgeLabel: copy.badgeLabel,
    rank: myRank,
    participantCount,
    myDurationSeconds: myFinishElapsedSeconds,
  };
}

// A forfeit duel record carries its OWN authoritative verdict (a 기권 badge): a forfeit is a
// deterministic terminal outcome the live arena already sealed (the forfeiter loses, the opponent
// wins) and the validator already shaped it. It is NEVER a finish-time race we can reconstruct, so
// it must resolve from the saved/forfeit record itself — never be forced PENDING forever.
function isForfeitMatchResult(matchResult) {
  return /기권/.test(String(matchResult?.badgeLabel ?? ''));
}

// The own measured finish elapsed a save (or a saved opponent run) carries. Prefer the duel
// matchResult's myDurationSeconds (the rank key), else the run's durationSeconds.
function finishElapsedFromSavedRun(matchResult, run) {
  if (Number.isInteger(matchResult?.myDurationSeconds) && matchResult.myDurationSeconds > 0) {
    return matchResult.myDurationSeconds;
  }
  if (Number.isInteger(run?.durationSeconds) && run.durationSeconds > 0) {
    return run.durationSeconds;
  }
  return null;
}

// NO-SESSION branch resolver: the live session is gone (pruned as the normal both-finished
// end-state), so the duel verdict is reconstructed SERVER-side from the durable saved runs —
// the SAME source buildResultFromSavedRuns uses for the GET /result endpoint, so the save path
// and the read path agree. The client-supplied resultTone/opponentName are NEVER trusted for a
// real matchId:
//   - A forfeit record carries its own sealed verdict (기권 badge) → returned UNCHANGED (a forfeit
//     is a deterministic terminal outcome, not a finish-time race; forcing PENDING would strand it).
//   - The OPPONENT's saved run exists → compute win/lose/draw from the two measured finish elapsed
//     (faster wins; equal = draw), overriding resultTone + opponentName/opponentId/opponent finish
//     from the opponent's own saved run, exactly like the session path — just sourced from runs.
//   - The opponent has NOT saved yet (this device saved first) → PENDING (no resultTone, no +20P).
//     The client reconcile path / a later GET upgrades it once the opponent's run lands.
// The current run being saved is NOT yet in store.runs (it is pushed after this resolver returns),
// so this device's own finish is read from the matchResult passed in, and only the OPPONENT's run
// is looked up in the store.
function resolveDuelMatchResultFromSavedRuns(store, currentUser, matchId, matchResult) {
  // A forfeit verdict is self-contained and already authoritative — keep it as saved.
  if (isForfeitMatchResult(matchResult)) {
    return matchResult;
  }

  const savedRunsByUserId = collectSavedMatchRuns(store, matchId);
  const opponentRun = [...savedRunsByUserId.entries()]
    .filter(([userId]) => userId !== currentUser.id)
    .map(([, run]) => run)[0] ?? null;

  // The opponent has not saved their run for this match yet → we cannot verify a winner. Never
  // trust the client's claimed win: store PENDING (0 bonus) and let the reconcile path upgrade it.
  if (!opponentRun) {
    return toPendingDuelMatchResult(matchResult);
  }

  const myFinishElapsedSeconds = finishElapsedFromSavedRun(matchResult, null);
  const opponentMatchResult = opponentRun.matchResult ?? {};
  const opponentFinishElapsedSeconds = finishElapsedFromSavedRun(opponentMatchResult, opponentRun);

  // Without both measured finishes we cannot rank the duel — stay PENDING rather than trust a
  // client tone (a missing finish elapsed must never resolve to a self-claimed win).
  if (myFinishElapsedSeconds === null || opponentFinishElapsedSeconds === null) {
    return toPendingDuelMatchResult(matchResult);
  }

  const outcome = myFinishElapsedSeconds === opponentFinishElapsedSeconds
    ? 'draw'
    : myFinishElapsedSeconds < opponentFinishElapsedSeconds
      ? 'win'
      : 'lose';

  const opponentUser = store.users.find((entry) => entry.id === opponentRun.userId) ?? null;
  const opponentName = (opponentUser?.name
    ?? (typeof matchResult.opponentName === 'string' && matchResult.opponentName.trim()
      ? matchResult.opponentName.trim()
      : null)
    ?? '상대');
  const copy = buildAuthoritativeDuelCopy(outcome, opponentName);

  const resolved = {
    ...matchResult,
    title: copy.title,
    badgeLabel: copy.badgeLabel,
    resultTone: outcome,
    opponentName,
    opponentId: opponentRun.userId,
    myDurationSeconds: myFinishElapsedSeconds,
    opponentDurationSeconds: opponentFinishElapsedSeconds,
  };

  // Carry the opponent's own saved pace label when available, else drop a stale client guess so
  // the card never shows a fabricated opponent number alongside the authoritative verdict.
  if (typeof opponentMatchResult.myPaceLabel === 'string' && opponentMatchResult.myPaceLabel) {
    resolved.opponentPaceLabel = opponentMatchResult.myPaceLabel;
  } else {
    delete resolved.opponentPaceLabel;
  }

  return resolved;
}

// The PENDING duel record: a duel matchResult whose definite win/lose is not yet known. It keeps
// the run's own measured pace/time but DROPS every win/lose-bearing field (resultTone, opponent
// finish time/pace, gapKm) and carries a neutral "결과 집계 중" badge. Because resultTone is
// absent, getMatchBonusPoints awards 0 (no +20P from a client-claimed win) and the client's
// isUnresolvedDuelMatchResult treats it as reconcilable, so the official verdict fills in later.
function toPendingDuelMatchResult(matchResult) {
  const pending = { ...matchResult };
  delete pending.resultTone;
  delete pending.opponentDurationSeconds;
  delete pending.opponentPaceLabel;
  delete pending.gapKm;
  pending.title = '대결 결과를 집계하고 있어요';
  pending.summary = '상대가 완주하면 결과가 자동으로 업데이트돼요.';
  pending.badgeLabel = '결과 집계 중';
  return pending;
}

// Region (지역) is read straight off the persisted user record — the same shape the
// opponent match-profile lookup in userRoutes uses (districtName/provinceName/cityName).
// A user who has since been deleted (or a synthetic test bot with no real account)
// degrades gracefully to null region instead of throwing.
function resolveParticipantRegion(store, userId) {
  const user = store.users.find((entry) => entry.id === userId);

  return {
    districtName: typeof user?.districtName === 'string' && user.districtName ? user.districtName : null,
    provinceName: typeof user?.provinceName === 'string' && user.provinceName ? user.provinceName : null,
    cityName: typeof user?.cityName === 'string' && user.cityName ? user.cityName : null,
  };
}

// OFFICIAL frozen pace seconds/km for a resolved participant: prefer the runner's own
// measured finish elapsed over the goal distance (the duel/group rank key), else the
// official average pace label already computed for the standing. Never recomputed from
// scratch — derived from the same numbers the rank-LP system used.
function resolvePaceSecondsPerKm(goalDistanceKm, finishElapsedSeconds, officialAveragePaceLabel) {
  if (Number.isInteger(finishElapsedSeconds) && finishElapsedSeconds > 0 && goalDistanceKm > 0) {
    return Math.round(finishElapsedSeconds / goalDistanceKm);
  }

  const paceMinutes = parsePaceToMinutes(officialAveragePaceLabel);

  if (paceMinutes !== null && paceMinutes > 0) {
    return Math.round(paceMinutes * 60);
  }

  return null;
}

// Reconstruct the per-participant result directly from a still-live (just-resolved)
// match session via the SAME resolved-standings builder the live status route uses
// (buildOfficialSessionStandings) plus buildDuelVerdict for the duel win/lose tone.
function buildResultFromSession(store, session, currentUserId, now) {
  const standings = buildOfficialSessionStandings(store, session, now);
  const goalDistanceKm = session.distanceKm;
  const mode = session.mode === 'group' ? 'group' : 'duel';
  const source = session.isPartyRun ? 'party' : 'official';

  // The duel verdict is the single source of truth for who won (server-decided by the
  // MEASURED finish elapsed). It already encodes draw + the §B4 DNF fallback, so the
  // duel result tone is read from it rather than re-derived from rank alone.
  const duelVerdict = mode === 'duel'
    ? buildDuelVerdict(session, standings, currentUserId, now)
    : null;
  // The group verdict is consulted here ONLY for the provisional flag (the roster/ranks below
  // keep reading the standings exactly as before); like the duel verdict it seals idempotently.
  const groupVerdict = mode === 'group'
    ? buildGroupVerdict(session, standings, currentUserId, now)
    : null;

  const participants = standings.map((standing) => {
    const sessionParticipant = session.participants.find((participant) => participant.userId === standing.userId);
    const runner = sessionParticipant
      ? resolveSessionParticipantProfile(store, sessionParticipant)
      : { name: standing.name };
    const region = resolveParticipantRegion(store, standing.userId);
    const finishElapsedSeconds = Number.isInteger(standing.finishElapsedSeconds)
      ? standing.finishElapsedSeconds
      : null;
    const forfeited = standing.liveStatus === 'forfeited';

    let resultTone = null;
    if (mode === 'duel' && duelVerdict?.resolved) {
      if (duelVerdict.outcome === 'draw') {
        resultTone = 'draw';
      } else if (duelVerdict.winnerUserId) {
        resultTone = standing.userId === duelVerdict.winnerUserId ? 'win' : 'lose';
      }
    }

    return {
      userId: standing.userId,
      name: runner.name ?? standing.name,
      districtName: region.districtName,
      provinceName: region.provinceName,
      cityName: region.cityName,
      paceSecondsPerKm: resolvePaceSecondsPerKm(goalDistanceKm, finishElapsedSeconds, standing.officialAveragePace),
      finishElapsedSeconds,
      distanceKm: goalDistanceKm,
      rank: Number.isInteger(standing.officialRank) ? standing.officialRank : null,
      resultTone,
      forfeited,
      isMe: standing.userId === currentUserId,
    };
  });

  // Additive top-level flags so the result surfaces can badge a still-revisable verdict
  // (가확정) and an actually-flipped one (정정). Old clients ignore both.
  const verdictForFlags = mode === 'duel' ? duelVerdict : groupVerdict;

  return {
    matchId: session.id,
    mode,
    source,
    comparedDistanceKm: goalDistanceKm,
    participants,
    ...(verdictForFlags?.provisional === true ? { provisional: true } : {}),
    ...(duelVerdict?.revised === true
      ? { revised: true, ...(duelVerdict.revisedAt ? { revisedAt: duelVerdict.revisedAt } : {}) }
      : {}),
  };
}

// Fallback for SAVED/old records whose live session was already pruned: rebuild the full
// per-participant roster from every saved run carrying this matchId. Each participant's
// own saved run is the durable record of their final official metrics (pace/time/region).
function collectSavedMatchRuns(store, matchId) {
  const byUserId = new Map();

  for (const run of store.runs) {
    if (run?.matchResult?.matchId !== matchId) {
      continue;
    }

    const existing = byUserId.get(run.userId);
    // Keep the most recent saved run per user (a user could in theory have several);
    // newest createdAt wins so a corrected save supersedes an earlier one.
    if (!existing || String(run.createdAt ?? '') > String(existing.createdAt ?? '')) {
      byUserId.set(run.userId, run);
    }
  }

  return byUserId;
}

// 오너 실기기 대결 2026-08-09: this used to divide by matchResult.comparedDistanceKm first.
// That field is the distance the CLIENT had compared at when it built the blob, and a screen-off
// freeze strands it at a partial value while the finish time keeps advancing — the real record was
// 6km / 37:07 (6:11/km) but carried comparedDistanceKm 3.06, so 대결 결과 displayed 12:08/km,
// roughly double, and disagreed with the 기록 상세 screen for the same run. The run's own measured
// distanceKm is the authoritative number the rest of the app shows, so pace is derived from it and
// comparedDistanceKm is only the fallback.
function paceSecondsFromRun(run, goalDistanceKm) {
  const matchResult = run.matchResult ?? {};
  const duration = Number.isInteger(matchResult.myDurationSeconds) ? matchResult.myDurationSeconds : null;
  const measuredDistanceKm = Number.isFinite(run.distanceKm) && run.distanceKm > 0
    ? run.distanceKm
    : Number.isFinite(matchResult.comparedDistanceKm) && matchResult.comparedDistanceKm > 0
      ? matchResult.comparedDistanceKm
      : goalDistanceKm;

  if (duration && measuredDistanceKm > 0) {
    return Math.round(duration / measuredDistanceKm);
  }

  const paceMinutes = parsePaceToMinutes(matchResult.myPaceLabel ?? run.pace);

  if (paceMinutes !== null && paceMinutes > 0) {
    return Math.round(paceMinutes * 60);
  }

  return null;
}

function buildResultFromSavedRuns(store, currentUser, matchId, savedRunsByUserId) {
  const myRun = savedRunsByUserId.get(currentUser.id);

  // Participant-only access: the requester must own a saved run for this match.
  if (!myRun) {
    return null;
  }

  const myMatchResult = myRun.matchResult ?? {};
  const mode = myMatchResult.mode === 'group' ? 'group' : 'duel';
  const source = myMatchResult.source === 'party' ? 'party' : 'official';
  const comparedDistanceKm = Number.isFinite(myMatchResult.comparedDistanceKm) && myMatchResult.comparedDistanceKm > 0
    ? myMatchResult.comparedDistanceKm
    : Number.isFinite(myRun.distanceKm) ? myRun.distanceKm : 0;

  const participants = [...savedRunsByUserId.values()].map((run) => {
    const matchResult = run.matchResult ?? {};
    const region = resolveParticipantRegion(store, run.userId);
    const finishElapsedSeconds = Number.isInteger(matchResult.myDurationSeconds)
      ? matchResult.myDurationSeconds
      : Number.isInteger(run.durationSeconds) ? run.durationSeconds : null;
    const goalDistanceKm = Number.isFinite(matchResult.comparedDistanceKm) && matchResult.comparedDistanceKm > 0
      ? matchResult.comparedDistanceKm
      : Number.isFinite(run.distanceKm) ? run.distanceKm : comparedDistanceKm;
    const resultTone = mode === 'duel' && ['win', 'lose', 'draw'].includes(matchResult.resultTone)
      ? matchResult.resultTone
      : null;

    return {
      userId: run.userId,
      // C2: each saved run's display name is that run OWNER's own real account name, looked up
      // by run.userId. The previous code used `matchResult.opponentName` for the non-viewer row,
      // but that field is the OTHER user's view of THEIR opponent (i.e. the viewer) — for a party
      // run it is a device label, not the row owner's name — so it mislabeled the opponent.
      name: store.users.find((entry) => entry.id === run.userId)?.name ?? '러너',
      districtName: region.districtName,
      provinceName: region.provinceName,
      cityName: region.cityName,
      paceSecondsPerKm: paceSecondsFromRun(run, goalDistanceKm),
      finishElapsedSeconds,
      distanceKm: goalDistanceKm,
      rank: Number.isInteger(matchResult.rank) ? matchResult.rank : null,
      resultTone,
      forfeited: resultTone === 'lose' && /기권/.test(String(matchResult.badgeLabel ?? '')),
      isMe: run.userId === currentUser.id,
    };
  });

  // For a duel we may only have the requester's own saved run (the opponent had not
  // saved, or is a synthetic bot). Reconstruct the missing opponent row so the WIN/LOSE
  // pair is always complete.
  //
  // C2 fix: the opponent's REAL identity comes from the persisted opponent userId
  // (myMatchResult.opponentId), resolved against the user store for the real account name +
  // region — never the viewer's own `myMatchResult.opponentName`, which for a party run is the
  // viewer's device label ("아이폰14"), not the opponent's account name. Only when no opponent
  // userId was persisted (truly anonymous bot / very old record) do we fall back to the saved
  // opponentName text.
  if (mode === 'duel' && participants.length === 1 && (myMatchResult.opponentId || myMatchResult.opponentName)) {
    const myTone = myMatchResult.resultTone;
    const opponentTone = myTone === 'win' ? 'lose' : myTone === 'lose' ? 'win' : myTone === 'draw' ? 'draw' : null;
    const opponentDuration = Number.isInteger(myMatchResult.opponentDurationSeconds)
      ? myMatchResult.opponentDurationSeconds
      : null;
    const opponentPaceMinutes = parsePaceToMinutes(myMatchResult.opponentPaceLabel);
    const opponentUserId = typeof myMatchResult.opponentId === 'string' && myMatchResult.opponentId
      ? myMatchResult.opponentId
      : null;
    const opponentUser = opponentUserId
      ? store.users.find((entry) => entry.id === opponentUserId) ?? null
      : null;
    const opponentRegion = opponentUserId ? resolveParticipantRegion(store, opponentUserId) : {
      districtName: null,
      provinceName: null,
      cityName: null,
    };
    // Prefer the opponent's real account name; only fall back to the saved opponentName when no
    // userId resolved a real user.
    const opponentName = opponentUser?.name ?? myMatchResult.opponentName ?? '러너';

    participants.push({
      userId: opponentUserId,
      name: opponentName,
      districtName: opponentRegion.districtName,
      provinceName: opponentRegion.provinceName,
      cityName: opponentRegion.cityName,
      paceSecondsPerKm: opponentDuration && comparedDistanceKm > 0
        ? Math.round(opponentDuration / comparedDistanceKm)
        : opponentPaceMinutes !== null && opponentPaceMinutes > 0
          ? Math.round(opponentPaceMinutes * 60)
          : null,
      finishElapsedSeconds: opponentDuration,
      distanceKm: comparedDistanceKm,
      rank: null,
      resultTone: opponentTone,
      forfeited: false,
      isMe: false,
    });
  }

  // Order by rank ascending (winner / 1등 first); rows without a rank sink to the bottom.
  // For a duel, the winning tone is pulled to the front so the WIN card always leads.
  participants.sort((left, right) => {
    if (mode === 'duel') {
      const toneOrder = (tone) => (tone === 'win' ? 0 : tone === 'draw' ? 1 : tone === 'lose' ? 2 : 3);
      const toneDelta = toneOrder(left.resultTone) - toneOrder(right.resultTone);
      if (toneDelta !== 0) {
        return toneDelta;
      }
    }
    const leftRank = Number.isInteger(left.rank) ? left.rank : Number.POSITIVE_INFINITY;
    const rightRank = Number.isInteger(right.rank) ? right.rank : Number.POSITIVE_INFINITY;
    return leftRank - rightRank;
  });

  return {
    matchId,
    mode,
    source,
    comparedDistanceKm,
    participants,
  };
}

// GET /api/running/matches/:matchId/result — the dedicated MATCH RESULT payload, always
// keyed by matchId so it reads identically from the live arena and from an old saved run.
// Resolves from the live session first (just-finished matches still in store.matchSessions),
// then falls back to the persisted saved-run records (pruned/old matches). Participant-only:
// a 404 is thrown when the match cannot be found, is not yet resolved, or the requester is
// not one of its participants.
export function buildMatchResultByMatchId(store, currentUser, matchId, now = new Date()) {
  const normalizedMatchId = typeof matchId === 'string' ? matchId.trim() : '';

  if (!normalizedMatchId) {
    throw new ApiError(404, '대결 결과를 찾을 수 없어요.');
  }

  const session = findRawMatchSessionById(store, normalizedMatchId);

  if (session) {
    const isParticipant = session.participants.some((participant) => participant.userId === currentUser.id);

    if (!isParticipant) {
      // Do not leak the existence of a match the requester is not part of.
      throw new ApiError(404, '대결 결과를 찾을 수 없어요.');
    }

    const standings = buildOfficialSessionStandings(store, session, now);
    // "Resolved" means at least one finisher/forfeit has produced an official ranking.
    // A match still purely in 'ready'/'matched' has no result yet → 404 (client handles it).
    const isResolved = standings.some((standing) => (
      Number.isInteger(standing.finishElapsedSeconds)
      || standing.liveStatus === 'forfeited'
      || standing.officialReady === true
    ));

    if (!isResolved) {
      throw new ApiError(404, '아직 대결 결과가 확정되지 않았어요.');
    }

    return buildResultFromSession(store, session, currentUser.id, now);
  }

  // Session already pruned → reconstruct from saved run records that carry this matchId.
  const savedRunsByUserId = collectSavedMatchRuns(store, normalizedMatchId);
  const reconstructed = buildResultFromSavedRuns(store, currentUser, normalizedMatchId, savedRunsByUserId);

  if (!reconstructed) {
    // No live session AND the requester owns no saved run for this match → indistinguishable
    // from "not a participant" / "never existed", so a single 404 is returned.
    throw new ApiError(404, '대결 결과를 찾을 수 없어요.');
  }

  return reconstructed;
}

// Back-fill the SAVED run.matchResult of every UNRESOLVED finisher of a live session so a
// PENDING "결과 집계 중" card heals into the sealed verdict. Each finisher's saved record is
// re-resolved against the (now-possibly-sealed) session via the SAME resolver the save path
// uses (resolveSavedDuelMatchResult / resolveSavedGroupMatchResult), so the healed card is
// byte-identical to what an at-save resolution would have produced — no new ranking/LP rule is
// introduced here. Only an UNRESOLVED record (no resultTone for a duel / no rank for a group,
// and not a forfeit) is rewritten — a card that already carries a definite verdict is never
// downgraded. Exported so the session-store sweep (which has no import path to the resolvers)
// can delegate the back-fill here, keeping the resolver as the single source of truth.
// Returns true if any run was rewritten.
export function backFillFinisherSavedRuns(store, session, now = new Date()) {
  if (!session) {
    return false;
  }

  const mode = session.mode === 'group' ? 'group' : session.mode === 'duel' ? 'duel' : null;
  if (!mode) {
    return false;
  }

  return backFillSavedRunsForMatchId(store, session.id, mode, now, readSessionParticipantIds(session)).length > 0;
}

// The match's authoritative roster. matchResult.matchId is free-form CLIENT input (the validator
// only trims it), so "everyone who saved a run carrying this matchId" is NOT a roster — it is
// whatever the internet claims. The session's participant list is the only server-built one.
function readSessionParticipantIds(session) {
  const participants = Array.isArray(session?.participants) ? session.participants : [];
  return new Set(participants.map((participant) => participant?.userId).filter(Boolean));
}

// 승자 0P 근치 (오너 2026-08-09, 실기기 대결에서 발견): 위 세션 기반 back-fill은
// sweepStuckMatchSessionFallbacks 안에서만 돌고, 그 sweep은 봉인(sealed)되거나 개정된 세션만
// 통과시킨다 — 둘 다 정상 완주한 대결은 봉인될 일이 없어 `continue`로 걸러지므로 back-fill에
// 영원히 도달하지 못했다. 그 사이 먼저 완주해서 먼저 저장한 쪽(= 이긴 쪽)의 블롭은 PENDING으로
// 굳고, resultTone이 없으니 getMatchBonusPoints가 0을 준다. 진 쪽은 나중에 저장하면서 상대
// 기록을 보고 'lose'로 해소돼 10P를 받는다 — 구조적으로 매 대결마다 승자만 손해를 봤다.
//
// 저장소에는 이미 치유 장치가 있었지만(같은 matchId 재저장 시 블롭 덮어쓰기) 그걸 불러줄 클라
// 재저장이 없어 고아로 남아 있었다. 여기서 상대가 저장하는 순간 서버가 스스로 그 치유를
// 발동시킨다 — 두 기록이 모두 저장된 시점이 곧 승패가 확정되는 시점이기 때문.
//
// LIVE SESSION 필수 (적대 검증 2026-08-09에서 두 건 실증되어 추가된 방어):
// matchId는 검증되지 않는 클라 입력이라 "이 matchId로 저장한 사람들"은 로스터가 아니다.
// 세션 없이 저장 기록만으로 상대를 고르면(resolveDuelMatchResultFromSavedRuns의 "나 아닌 첫
// 기록") 두 가지가 실증됐다 — ① 참가자가 아닌 제3자가 남의 matchId로 기록을 올려 진짜
// 참가자의 승리를 패배로 영구히 덮을 수 있고(확정 판정이 되어 진짜 치유가 영영 막힌다),
// ② 악의가 없어도 중도 포기한 짧은 기록이 상대로 잡혀 실제 완주자를 패배로 뒤집는다.
// 세션 분기는 참가자 검증(:88)과 실제 완주 상태(buildDuelVerdict)를 모두 거치므로 둘 다 막힌다.
// 완주 후 세션은 MATCH_SESSION_ALL_DONE_RETENTION_MS(10분) 동안 남으므로 정상 대결은 그 안에
// 치유된다. 그보다 늦게 도착한 저장(대기열 드레인 등)은 치유하지 않고 PENDING으로 남긴다 —
// 추측으로 남의 기록을 고치느니 그대로 두는 쪽이 안전하다. 그런 잔여분은
// scripts/backfill-pending-match-results.mjs 가 운영자 확인 아래 따로 처리한다.
//
// 반환값은 기록이 실제로 고쳐진 유저 id 목록 — 포인트는 저장된 잔액이 아니라 블롭에서 매번
// 파생되므로, 호출자는 그 유저들의 메모된 메트릭만 버리면 과거 포인트까지 자동으로 복구된다.
export function backFillMatchCounterpartSavedRuns(store, matchResult, now = new Date()) {
  const matchId = typeof matchResult?.matchId === 'string' ? matchResult.matchId.trim() : '';
  const mode = matchResult?.mode === 'group'
    ? 'group'
    : matchResult?.mode === 'duel' ? 'duel' : null;

  if (!matchId || !mode) {
    return [];
  }

  const session = findRawMatchSessionById(store, matchId);

  if (!session || session.mode !== mode) {
    return [];
  }

  return backFillSavedRunsForMatchId(store, matchId, mode, now, readSessionParticipantIds(session));
}

export const MATCH_GOAL_DISTANCE_TOLERANCE_KM = 0.6;

// Without a live session the verdict is ranked on RAW ELAPSED alone (resolveDuelMatchResultFromSavedRuns
// :382-396) with no check that the runner actually covered the match goal. So a mid-run quit —
// 1.2km in 400s — outranks a genuine 5km/1500s finisher and inverts the result. A saved run is
// therefore usable as evidence only when it demonstrably completed the goal AND is physically
// plausible. A blob carrying no recorded goal cannot be checked at all: treat that as
// untrustworthy rather than waving it through (적대 재검증 2026-08-09 — the missing/zero
// comparedDistanceKm case was the hole left in the first hardening pass).
export function isTrustworthyMatchEvidence(run) {
  const goalKm = Number(run?.matchResult?.comparedDistanceKm);
  const distanceKm = Number(run?.distanceKm);
  const durationSeconds = Number(run?.durationSeconds);

  if (!Number.isFinite(goalKm) || goalKm <= 0) {
    return false;
  }

  if (!Number.isFinite(distanceKm) || distanceKm + MATCH_GOAL_DISTANCE_TOLERANCE_KM < goalKm) {
    return false;
  }

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return false;
  }

  // Reuses the app's own anti-cheat rule rather than inventing a second speed threshold — this is
  // what rejects an impossible pace (the 0:53/km case) being used to outrank a real finisher.
  // Only 'vehicle' disqualifies: the classifier returns 'suspect' for ANY run without a cadence
  // reading (runIntegrity.mjs:121), which is a large share of real records, and 'suspect' is by
  // its own contract "flagged, never auto-punished".
  return classifyRunIntegrity({
    distanceKm,
    durationSeconds,
    cadenceSpm: run?.cadenceSpm,
  }) !== 'vehicle';
}

// Operator-driven entry point for the retroactive repair script, where the live session is long
// gone and the roster therefore cannot be read from the store. The caller MUST supply a roster it
// verified out-of-band (the script requires --participants and prints a dry run first). Kept
// separate from backFillMatchCounterpartSavedRuns so no request-path code can ever reach a
// back-fill with a roster it did not derive from a session.
//
// The refusals below are defense in depth: the script surfaces the same conditions as readable
// blockers, but they are enforced HERE too so a future caller cannot re-open the defect simply by
// skipping the script's checks.
export function backFillSavedRunsWithVerifiedRoster(store, matchId, mode, participantIds, now = new Date()) {
  const roster = participantIds instanceof Set ? participantIds : new Set(participantIds ?? []);
  const matchRuns = (store?.runs ?? []).filter((run) => run?.matchResult?.matchId === matchId);
  const rosterRuns = matchRuns.filter((run) => roster.has(run.userId));

  // A run by someone outside the roster is not merely ignorable: the session-less resolver picks
  // the opponent as "first saved run that isn't me", so leaving it in the store lets it decide the
  // verdict. Refuse the whole match instead.
  if (matchRuns.length !== rosterRuns.length) {
    return [];
  }

  // Two measured finishes are the minimum a verdict can be derived from.
  if (rosterRuns.length < 2 || !rosterRuns.every(isTrustworthyMatchEvidence)) {
    return [];
  }

  return backFillSavedRunsForMatchId(store, matchId, mode, now, roster);
}

// Shared core for both back-fill entry points above. Re-resolves every UNRESOLVED saved blob
// carrying `matchId` (of `mode`) through the SAME resolver the save path uses, and persists only a
// genuine upgrade. Returns the ids of the users whose run was rewritten.
//
// `participantIds` is REQUIRED and must be a server-built roster (never "whoever saved a run with
// this matchId" — matchId is unvalidated client input). A run whose owner is outside the roster is
// never rewritten, so a forged matchId cannot reach a real participant's record.
function backFillSavedRunsForMatchId(store, matchId, mode, now, participantIds) {
  if (!matchId || (mode !== 'duel' && mode !== 'group')
    || !(participantIds instanceof Set) || participantIds.size === 0
    || !Array.isArray(store?.runs) || !store.runs.length) {
    return [];
  }

  const healedUserIds = [];

  for (const run of store.runs) {
    const matchResult = run?.matchResult;
    if (!matchResult || matchResult.matchId !== matchId || matchResult.mode !== mode) {
      continue;
    }

    // A run whose owner is not on the server-built roster only PROVES that someone posted this
    // matchId — it is not evidence about the match. Never rewrite it, and never let it stand in
    // as a participant.
    if (!participantIds.has(run.userId)) {
      continue;
    }

    // Only heal an UNRESOLVED placeholder; a definite verdict (duel resultTone / group rank)
    // or a forfeit record is authoritative and must never be downgraded.
    const isForfeit = /기권/.test(String(matchResult.badgeLabel ?? ''));
    const isUnresolved = mode === 'duel'
      ? !['win', 'lose', 'draw'].includes(matchResult.resultTone)
      : !Number.isInteger(matchResult.rank);
    if (isForfeit || !isUnresolved) {
      continue;
    }

    const owner = store.users.find((entry) => entry.id === run.userId);
    if (!owner) {
      continue;
    }

    const resolved = mode === 'group'
      ? resolveSavedGroupMatchResult(store, owner, matchResult, now)
      : resolveSavedDuelMatchResult(store, owner, matchResult, now);

    // The resolver returns a NEW object only when it could resolve a verdict; a still-PENDING
    // result keeps the neutral "결과 집계 중" badge. Persist only a genuine upgrade (a resolved
    // duel tone / a sealed group rank) so the card heals exactly once and never thrashes.
    const upgraded = mode === 'duel'
      ? ['win', 'lose', 'draw'].includes(resolved?.resultTone)
      : Number.isInteger(resolved?.rank);
    if (resolved && upgraded && resolved !== matchResult) {
      run.matchResult = resolved;
      healedUserIds.push(run.userId);

      // Anti-cheat stage 2: this back-fill is the moment LP has certainly been applied
      // for a FINISHER-FIRST runner (their save landed before the opponent finished, so
      // the save-time check found no rank_change marker to revoke yet). Re-running the
      // idempotent, never-throwing integrity check here closes exactly that timeline —
      // a vehicle-flagged run gets its LP revoked against the by-now-appended marker.
      applyRunIntegrityCheck({ store, user: owner, run });
    }
  }

  return healedUserIds;
}

// Register the resolver-backed back-fill into the session-store sweep at module init, breaking
// the load-time cycle (the session store imports nothing from here). pruneMatchSessions' sweep
// then heals the finisher's saved run whenever it seals a stranded one-finisher match.
registerFinisherSavedRunBackfill(backFillFinisherSavedRuns);
