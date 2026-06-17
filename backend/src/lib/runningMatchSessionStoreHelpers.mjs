import { parsePaceToMinutes } from '../points.mjs';
import {
  MATCH_DUEL_FINISH_FALLBACK_MS,
  MATCH_SESSION_ACTIVE_TTL_MS,
  MATCH_SESSION_UNSTARTED_ACTIVE_GRACE_MS,
} from './matchConstants.mjs';
import {
  buildLevelLabel,
  buildProgressAveragePaceLabel,
  formatPaceMinutesLabel,
} from './matchFormatting.mjs';
import {
  isParticipantDoneWithMatch,
  normalizeMatchQueueDistance,
  projectOfficialDistanceKm,
  resolveParticipantLiveStatus,
} from './matchPureHelpers.mjs';
import { nextId } from './idHelpers.mjs';
import { isTestMatchSession } from './matchScheduleHelpers.mjs';
import { findUserById, getRunsForUser, getUserMetrics } from './userStoreHelpers.mjs';

export function buildMatchRunnerProfile(store, user) {
  const metrics = getUserMetrics(store, user.id);
  const recentRuns = getRunsForUser(store, user.id).slice(0, 3);
  const parsedPaces = recentRuns
    .map((run) => parsePaceToMinutes(run.pace))
    .filter((pace) => pace !== null);
  const averagePaceMinutes = parsedPaces.length
    ? parsedPaces.reduce((sum, pace) => sum + pace, 0) / parsedPaces.length
    : 5.5;
  const latestDistanceKm = recentRuns[0]?.distanceKm ?? metrics.currentWeekDistanceKm ?? 0;

  return {
    id: user.id,
    name: user.name,
    tag: user.publicTag,
    districtName: user.districtName,
    averagePaceMinutes,
    averagePace: formatPaceMinutesLabel(averagePaceMinutes),
    distanceLevel: metrics.distanceLevel,
    levelLabel: buildLevelLabel(metrics.distanceLevel),
    weeklyDistanceKm: metrics.currentWeekDistanceKm,
    lifetimeDistanceKm: metrics.lifetimeDistanceKm,
    latestDistanceKm,
  };
}

export function resolveSessionParticipantProfile(store, participant) {
  if (participant.profileSnapshot) {
    return participant.profileSnapshot;
  }

  return buildMatchRunnerProfile(store, findUserById(store, participant.userId));
}


export function ensureMatchSessions(store) {
  if (!Array.isArray(store.matchSessions)) {
    store.matchSessions = [];
  }

  return store.matchSessions;
}

export function hydrateMatchSessionState(session, now = new Date()) {
  const nowMs = now.getTime();
  const startedAtMs = session.startedAt ? new Date(session.startedAt).getTime() : Number.NaN;
  const slotStartAtMs = new Date(session.slotStartAt).getTime();
  const hasLiveProgress = session.participants.some((participant) => {
    const liveStatus = resolveParticipantLiveStatus(participant, now);
    return ['running', 'background', 'paused', 'finished', 'disconnected', 'forfeited'].includes(liveStatus);
  });

  if (Number.isFinite(startedAtMs)) {
    const hasNeverReallyStarted = !hasLiveProgress
      && session.participants.every((participant) => !participant.liveUpdatedAt);

    if (hasNeverReallyStarted) {
      const referenceStartMs = Number.isFinite(slotStartAtMs) ? slotStartAtMs : startedAtMs;

      if (referenceStartMs + MATCH_SESSION_UNSTARTED_ACTIVE_GRACE_MS <= nowMs) {
        return 'expired';
      }
    }

    return startedAtMs + MATCH_SESSION_ACTIVE_TTL_MS > nowMs ? 'active' : 'expired';
  }

  if (Number.isFinite(slotStartAtMs) && slotStartAtMs <= nowMs) {
    session.startedAt = new Date(slotStartAtMs).toISOString();
    return 'active';
  }

  if (hasLiveProgress) {
    session.startedAt = new Date(Math.min(nowMs, slotStartAtMs)).toISOString();
    return 'active';
  }

  if (!Number.isFinite(slotStartAtMs) || slotStartAtMs + MATCH_SESSION_ACTIVE_TTL_MS <= nowMs) {
    return 'expired';
  }

  return 'matched';
}

export function pruneMatchSessions(store, now = new Date()) {
  const sessions = ensureMatchSessions(store);
  const activeUserIds = new Set(store.users.map((user) => user.id));

  store.matchSessions = sessions.filter((session) => {
    if (!session || !Array.isArray(session.participants) || !session.participants.length) {
      return false;
    }

    if (session.participants.some((participant) => !participant.profileSnapshot && !activeUserIds.has(participant.userId))) {
      return false;
    }

    if (session.participants.every((participant) => isParticipantDoneWithMatch(participant, now))) {
      return false;
    }

    return hydrateMatchSessionState(session, now) !== 'expired';
  });

  return store.matchSessions;
}

function clearUsersFromMatchSessions(store, mode, userIds) {
  const blockedUserIds = new Set(userIds);
  const sessions = pruneMatchSessions(store);
  store.matchSessions = sessions.filter((session) => (
    session.mode !== mode || !session.participants.some((participant) => (
      blockedUserIds.has(participant.userId) && !isParticipantDoneWithMatch(participant)
    ))
  ));
}

export function createMatchSession(store, mode, distanceKm, slotStartAt, participants, options = {}) {
  clearUsersFromMatchSessions(store, mode, participants.map((participant) => participant.id));
  const session = {
    id: nextId(`${mode}-match`),
    mode,
    isTestMatch: options.isTestMatch === true,
    isPartyRun: options.isPartyRun === true,
    distanceKm: normalizeMatchQueueDistance(distanceKm),
    slotStartAt,
    createdAt: new Date().toISOString(),
    matchedAt: new Date().toISOString(),
    participants: participants.map((participant, index) => ({
      userId: participant.id,
      seedRank: participant.seedRank ?? index + 1,
      ...(participant.profileSnapshot ? { profileSnapshot: participant.profileSnapshot } : {}),
      acceptedAt: null,
      liveStatus: 'ready',
      liveDistanceKm: 0,
      liveElapsedSeconds: 0,
      livePace: '--:--/km',
      liveUpdatedAt: null,
      finishedAt: null,
      finishElapsedSeconds: null,
    })),
  };
  ensureMatchSessions(store).push(session);
  return session;
}


function buildSyntheticParticipantLiveSnapshot(session, participant, now = new Date()) {
  if (!participant?.profileSnapshot || hydrateMatchSessionState(session, now) !== 'active') {
    return null;
  }

  if (typeof participant.liveUpdatedAt === 'string' && participant.liveUpdatedAt.trim()) {
    return null;
  }

  const storedStatus = typeof participant.liveStatus === 'string' && participant.liveStatus
    ? participant.liveStatus
    : 'ready';

  if (['forfeited', 'finished'].includes(storedStatus)) {
    return null;
  }

  const startedAtMs = new Date(session.startedAt ?? session.slotStartAt).getTime();
  const paceMinutes = parsePaceToMinutes(participant.profileSnapshot.averagePace);

  if (!Number.isFinite(startedAtMs) || paceMinutes === null) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - startedAtMs) / 1000));
  const estimatedDistanceKm = Math.min(
    session.distanceKm,
    Number((elapsedSeconds / Math.max(1, paceMinutes * 60)).toFixed(2)),
  );
  const syntheticStatus = estimatedDistanceKm >= session.distanceKm ? 'finished' : 'running';

  return {
    liveDistanceKm: estimatedDistanceKm,
    liveElapsedSeconds: elapsedSeconds,
    livePace: participant.profileSnapshot.averagePace,
    liveUpdatedAt: now.toISOString(),
    liveStatus: syntheticStatus,
    ...(syntheticStatus === 'finished' ? { finishedAt: now.toISOString() } : {}),
  };
}

export function buildParticipantLiveSnapshot(session, participant, now = new Date()) {
  const syntheticSnapshot = buildSyntheticParticipantLiveSnapshot(session, participant, now);
  const liveStatus = syntheticSnapshot?.liveStatus ?? resolveParticipantLiveStatus(participant, now);

  return {
    ...(typeof syntheticSnapshot?.liveDistanceKm === 'number'
      ? { liveDistanceKm: syntheticSnapshot.liveDistanceKm }
      : typeof participant.liveDistanceKm === 'number'
        ? { liveDistanceKm: Number(participant.liveDistanceKm.toFixed(2)) }
        : {}),
    ...(typeof syntheticSnapshot?.liveElapsedSeconds === 'number'
      ? { liveElapsedSeconds: syntheticSnapshot.liveElapsedSeconds }
      : typeof participant.liveElapsedSeconds === 'number'
        ? { liveElapsedSeconds: participant.liveElapsedSeconds }
        : {}),
    ...(typeof syntheticSnapshot?.livePace === 'string' && syntheticSnapshot.livePace.trim()
      ? { livePace: syntheticSnapshot.livePace.trim() }
      : typeof participant.livePace === 'string' && participant.livePace.trim()
        ? { livePace: participant.livePace.trim() }
        : {}),
    ...(typeof syntheticSnapshot?.liveUpdatedAt === 'string' && syntheticSnapshot.liveUpdatedAt
      ? { liveUpdatedAt: syntheticSnapshot.liveUpdatedAt }
      : typeof participant.liveUpdatedAt === 'string' && participant.liveUpdatedAt
        ? { liveUpdatedAt: participant.liveUpdatedAt }
        : {}),
    liveStatus,
    ...(typeof syntheticSnapshot?.finishedAt === 'string' && syntheticSnapshot.finishedAt
      ? { finishedAt: syntheticSnapshot.finishedAt }
      : typeof participant.finishedAt === 'string' && participant.finishedAt
        ? { finishedAt: participant.finishedAt }
      : {}),
    ...(typeof participant.forfeitedAt === 'string' && participant.forfeitedAt
      ? { forfeitedAt: participant.forfeitedAt }
      : {}),
  };
}

export function buildOfficialSessionStandings(store, session, now = new Date()) {
  const snapshots = session.participants.map((participant) => {
    const runner = resolveSessionParticipantProfile(store, participant);
    const liveSnapshot = buildParticipantLiveSnapshot(session, participant, now);
    const liveDistanceKm = typeof liveSnapshot.liveDistanceKm === 'number' && Number.isFinite(liveSnapshot.liveDistanceKm)
      ? Math.max(0, liveSnapshot.liveDistanceKm)
      : 0;
    const liveElapsedSeconds = Number.isInteger(liveSnapshot.liveElapsedSeconds) && liveSnapshot.liveElapsedSeconds >= 0
      ? liveSnapshot.liveElapsedSeconds
      : 0;
    const liveStatus = liveSnapshot.liveStatus ?? 'ready';
    const hasProgress = typeof liveSnapshot.liveUpdatedAt === 'string'
      && liveSnapshot.liveUpdatedAt
      && liveElapsedSeconds > 0
      && !['ready', 'forfeited'].includes(liveStatus);
    const contributesToLiveCheckpoint = hasProgress && ['running', 'background'].includes(liveStatus);
    // The frozen MEASURED finish elapsed is the duel rank key. For legacy/in-flight
    // participants that finished before this field existed, fall back to the recorded
    // elapsed at finish so a finisher is never treated as "not finished" in the sort.
    const isFinished = liveStatus === 'finished'
      || (typeof participant.finishedAt === 'string' && Boolean(participant.finishedAt));
    const storedFinishElapsedSeconds = Number.isInteger(participant.finishElapsedSeconds) && participant.finishElapsedSeconds >= 0
      ? participant.finishElapsedSeconds
      : null;
    const finishElapsedSeconds = storedFinishElapsedSeconds !== null
      ? storedFinishElapsedSeconds
      : isFinished
        ? liveElapsedSeconds
        : null;

    return {
      userId: participant.userId,
      name: runner.name,
      seedRank: participant.seedRank,
      liveDistanceKm,
      liveElapsedSeconds,
      liveStatus,
      finishedAt: typeof liveSnapshot.finishedAt === 'string' && liveSnapshot.finishedAt
        ? liveSnapshot.finishedAt
        : typeof participant.finishedAt === 'string' && participant.finishedAt
          ? participant.finishedAt
          : null,
      finishElapsedSeconds,
      forfeitedAt: typeof liveSnapshot.forfeitedAt === 'string' && liveSnapshot.forfeitedAt
        ? liveSnapshot.forfeitedAt
        : typeof participant.forfeitedAt === 'string' && participant.forfeitedAt
          ? participant.forfeitedAt
          : null,
      hasProgress,
      contributesToLiveCheckpoint,
      officialAveragePace: buildProgressAveragePaceLabel(liveDistanceKm, liveElapsedSeconds),
    };
  });

  const readySnapshots = snapshots.filter((snapshot) => snapshot.hasProgress);
  const liveCheckpointSnapshots = readySnapshots.filter((snapshot) => snapshot.contributesToLiveCheckpoint);
  const officialElapsedSeconds = liveCheckpointSnapshots.length > 0
    ? Math.max(0, Math.min(...liveCheckpointSnapshots.map((snapshot) => snapshot.liveElapsedSeconds)))
    : readySnapshots.length > 0
      ? Math.max(0, Math.max(...readySnapshots.map((snapshot) => snapshot.liveElapsedSeconds)))
      : 0;
  const comparedAt = now.toISOString();

  const rankedSnapshots = snapshots
    .map((snapshot) => {
      const officialReady = officialElapsedSeconds > 0 && snapshot.hasProgress;
      return {
        ...snapshot,
        officialReady,
        officialElapsedSeconds,
        officialComparedAt: comparedAt,
        officialDistanceKm: officialReady
          ? projectOfficialDistanceKm(
              snapshot.liveDistanceKm,
              snapshot.liveElapsedSeconds,
              officialElapsedSeconds,
              session.distanceKm,
            )
          : 0,
      };
    })
    .sort((left, right) => {
      if (left.officialReady !== right.officialReady) {
        return left.officialReady ? -1 : 1;
      }

      const leftForfeited = left.liveStatus === 'forfeited';
      const rightForfeited = right.liveStatus === 'forfeited';
      // Order forfeited BELOW non-forfeited.
      if (leftForfeited !== rightForfeited) {
        return leftForfeited ? 1 : -1;
      }
      // Two forfeiters are ranked among themselves by distance covered desc, then by
      // forfeit time desc (whoever quit LATER ran longer/further and ranks better).
      // Otherwise they'd tie on officialDistanceKm (both 0) + seedRank and show as
      // "공동 N등".
      if (leftForfeited && rightForfeited) {
        if (right.officialDistanceKm !== left.officialDistanceKm) {
          return right.officialDistanceKm - left.officialDistanceKm;
        }
        const leftForfeitMs = typeof left.forfeitedAt === 'string' ? Date.parse(left.forfeitedAt) : NaN;
        const rightForfeitMs = typeof right.forfeitedAt === 'string' ? Date.parse(right.forfeitedAt) : NaN;
        const leftForfeitValue = Number.isFinite(leftForfeitMs) ? leftForfeitMs : 0;
        const rightForfeitValue = Number.isFinite(rightForfeitMs) ? rightForfeitMs : 0;
        if (rightForfeitValue !== leftForfeitValue) {
          return rightForfeitValue - leftForfeitValue;
        }
        return left.seedRank - right.seedRank;
      }

      // Finish order IS the rank, decided by the MEASURED finish elapsed (each
      // runner's own slot-anchored stopwatch at the goal), NOT the server receive
      // time — receive time is network-jitter-dependent and let a later finisher
      // outrank someone who actually crossed the line a second earlier. A finished
      // runner carries finishElapsedSeconds; a still-running one carries null.
      const leftHasFinish = Number.isInteger(left.finishElapsedSeconds);
      const rightHasFinish = Number.isInteger(right.finishElapsedSeconds);
      if (leftHasFinish !== rightHasFinish) {
        return leftHasFinish ? -1 : 1;
      }
      if (leftHasFinish && rightHasFinish) {
        if (left.finishElapsedSeconds !== right.finishElapsedSeconds) {
          return left.finishElapsedSeconds - right.finishElapsedSeconds;
        }
        // Exact dead-heat on measured elapsed: deterministic tie-break so the
        // result is always defined — earlier server receipt first, then seedRank.
        const leftFinishedMs = typeof left.finishedAt === 'string' ? Date.parse(left.finishedAt) : NaN;
        const rightFinishedMs = typeof right.finishedAt === 'string' ? Date.parse(right.finishedAt) : NaN;
        const leftFinishedValue = Number.isFinite(leftFinishedMs) ? leftFinishedMs : Number.POSITIVE_INFINITY;
        const rightFinishedValue = Number.isFinite(rightFinishedMs) ? rightFinishedMs : Number.POSITIVE_INFINITY;
        if (leftFinishedValue !== rightFinishedValue) {
          return leftFinishedValue - rightFinishedValue;
        }
        return left.seedRank - right.seedRank;
      }

      if (right.officialDistanceKm !== left.officialDistanceKm) {
        return right.officialDistanceKm - left.officialDistanceKm;
      }

      return left.seedRank - right.seedRank;
    });

  return rankedSnapshots.map((snapshot, index, array) => {
    const leaderDistanceKm = array[0]?.officialDistanceKm ?? 0;
    const aheadRunner = index > 0 ? array[index - 1] : null;
    const publicSnapshot = { ...snapshot };
    delete publicSnapshot.contributesToLiveCheckpoint;
    return {
      ...publicSnapshot,
      officialRank: index + 1,
      officialGapLeaderKm: Number(Math.max(0, leaderDistanceKm - snapshot.officialDistanceKm).toFixed(2)),
      officialGapAheadKm: aheadRunner
        ? Number(Math.max(0, aheadRunner.officialDistanceKm - snapshot.officialDistanceKm).toFixed(2))
        : null,
    };
  });
}


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

  return {
    resolved,
    winnerUserId,
    outcome,
    myFinishElapsedSeconds,
    opponentFinishElapsedSeconds,
    myPaceLabel: resolveDuelVerdictPaceLabel(mine, goalDistanceKm),
    opponentPaceLabel: resolveDuelVerdictPaceLabel(opponent, goalDistanceKm),
  };
}


export function findMatchSessionById(store, matchId) {
  if (!matchId) {
    return null;
  }

  return pruneMatchSessions(store).find((session) => session.id === matchId) ?? null;
}


export function findMatchSessionForUser(store, mode, userId, { distanceKm, slotStartAt, testMode = false, matchId } = {}) {
  if (matchId) {
    const directSession = findMatchSessionById(store, matchId);

    if (!directSession || directSession.mode !== mode) {
      return null;
    }

    if (isTestMatchSession(directSession) !== testMode) {
      return null;
    }

    if (!directSession.participants.some((participant) => participant.userId === userId)) {
      return null;
    }

    return directSession;
  }

  const normalizedDistanceKm = distanceKm === undefined ? null : normalizeMatchQueueDistance(distanceKm);
  const sessions = pruneMatchSessions(store);

  for (let index = sessions.length - 1; index >= 0; index -= 1) {
    const session = sessions[index];
    if (session.mode !== mode) {
      continue;
    }

    if (isTestMatchSession(session) !== testMode) {
      continue;
    }

    if (!session.participants.some((participant) => (
      participant.userId === userId && !isParticipantDoneWithMatch(participant)
    ))) {
      continue;
    }

    if (normalizedDistanceKm !== null && Math.abs(session.distanceKm - normalizedDistanceKm) >= 0.15) {
      continue;
    }

    if (!testMode && slotStartAt && session.slotStartAt !== slotStartAt) {
      continue;
    }

    return session;
  }

  return null;
}


export function findAnyReservedMatchSessionForUser(store, userId, now = new Date()) {
  const sessions = pruneMatchSessions(store, now);

  for (const session of sessions) {
    const participant = session.participants.find((item) => (
      item.userId === userId && !isParticipantDoneWithMatch(item, now)
    ));

    if (!participant) {
      continue;
    }

    const state = hydrateMatchSessionState(session, now);

    if (['matched', 'active'].includes(state)) {
      return { session, state };
    }
  }

  return null;
}
