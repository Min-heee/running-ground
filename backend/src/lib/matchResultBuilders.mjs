import { ApiError } from '../response/httpResponse.mjs';
import { parsePaceToMinutes } from '../points.mjs';
import {
  buildDuelVerdict,
  buildOfficialSessionStandings,
  ensureMatchSessions,
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

  return {
    matchId: session.id,
    mode,
    source,
    comparedDistanceKm: goalDistanceKm,
    participants,
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

function paceSecondsFromRun(run, goalDistanceKm) {
  const matchResult = run.matchResult ?? {};
  const duration = Number.isInteger(matchResult.myDurationSeconds) ? matchResult.myDurationSeconds : null;
  const comparedDistanceKm = Number.isFinite(matchResult.comparedDistanceKm) && matchResult.comparedDistanceKm > 0
    ? matchResult.comparedDistanceKm
    : goalDistanceKm;

  if (duration && comparedDistanceKm > 0) {
    return Math.round(duration / comparedDistanceKm);
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
      name: matchResult.opponentName && run.userId !== currentUser.id
        ? matchResult.opponentName
        : (store.users.find((entry) => entry.id === run.userId)?.name ?? '러너'),
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
  // saved, or is a synthetic bot). Reconstruct the missing opponent row from the
  // requester's matchResult so the WIN/LOSE pair is always complete.
  if (mode === 'duel' && participants.length === 1 && myMatchResult.opponentName) {
    const myTone = myMatchResult.resultTone;
    const opponentTone = myTone === 'win' ? 'lose' : myTone === 'lose' ? 'win' : myTone === 'draw' ? 'draw' : null;
    const opponentDuration = Number.isInteger(myMatchResult.opponentDurationSeconds)
      ? myMatchResult.opponentDurationSeconds
      : null;
    const opponentPaceMinutes = parsePaceToMinutes(myMatchResult.opponentPaceLabel);

    participants.push({
      userId: null,
      name: myMatchResult.opponentName,
      districtName: null,
      provinceName: null,
      cityName: null,
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
    throw new ApiError(404, '대결 결과를 찾을 수 없어.');
  }

  const session = findRawMatchSessionById(store, normalizedMatchId);

  if (session) {
    const isParticipant = session.participants.some((participant) => participant.userId === currentUser.id);

    if (!isParticipant) {
      // Do not leak the existence of a match the requester is not part of.
      throw new ApiError(404, '대결 결과를 찾을 수 없어.');
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
      throw new ApiError(404, '아직 대결 결과가 확정되지 않았어.');
    }

    return buildResultFromSession(store, session, currentUser.id, now);
  }

  // Session already pruned → reconstruct from saved run records that carry this matchId.
  const savedRunsByUserId = collectSavedMatchRuns(store, normalizedMatchId);
  const reconstructed = buildResultFromSavedRuns(store, currentUser, normalizedMatchId, savedRunsByUserId);

  if (!reconstructed) {
    // No live session AND the requester owns no saved run for this match → indistinguishable
    // from "not a participant" / "never existed", so a single 404 is returned.
    throw new ApiError(404, '대결 결과를 찾을 수 없어.');
  }

  return reconstructed;
}
