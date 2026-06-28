import { parsePaceToMinutes } from '../points.mjs';
import {
  GROUP_MATCH_MAX_PARTICIPANTS,
  GROUP_PACE_MATCH_TOLERANCE_SECONDS,
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

// The saved-run back-fill lives in matchResultBuilders.mjs (it reuses the save-path resolvers,
// the single source of truth for a healed card). matchResultBuilders already imports THIS
// module, so to avoid a load-time import cycle the back-fill is INJECTED here via a setter that
// matchResultBuilders calls at module init. Until it is registered the sweep still seals the
// fallback (the load-bearing persistence step); the back-fill is a best-effort display heal.
let backFillFinisherSavedRunsImpl = null;

export function registerFinisherSavedRunBackfill(impl) {
  backFillFinisherSavedRunsImpl = typeof impl === 'function' ? impl : null;
}

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

export function pruneMatchSessions(store, now = new Date()) {
  const sessions = ensureMatchSessions(store);
  const activeUserIds = new Set(store.users.map((user) => user.id));

  // Self-heal stuck one-finisher matches BEFORE pruning so a sealed-but-stranded session is
  // resolved + back-filled while it is still physically present. A sealed DNF runner stays a
  // non-finisher (not "done"), so a freshly-sealed one-finisher session is NOT dropped by the
  // filter below — it persists until both sides are terminal or it expires, exactly as before.
  sweepStuckMatchSessionFallbacks(store, now);

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

// Single source of truth for the per-participant session shape. addParticipantToMatchSession
// reuses it so a late joiner is byte-for-byte identical to a founding participant.
function buildSessionParticipant(participant, index) {
  return {
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
  };
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
    // The group anchor — the average pace of the founding 3 — is the gate every later
    // joiner is measured against (±GROUP_PACE_MATCH_TOLERANCE_SECONDS). Persisted at
    // creation; undefined for duels/test sessions where no anchor is supplied.
    ...(Number.isFinite(options.anchorPaceMinutes) ? { anchorPaceMinutes: options.anchorPaceMinutes } : {}),
    createdAt: new Date().toISOString(),
    matchedAt: new Date().toISOString(),
    participants: participants.map((participant, index) => buildSessionParticipant(participant, index)),
  };
  ensureMatchSessions(store).push(session);
  return session;
}

// One-at-a-time late-join admission: push exactly one participant (the closest joiner
// the caller already selected) onto an existing forming group session, using the same
// shape createMatchSession produces. seedRank defaults to the next slot after the
// current participants.
export function addParticipantToMatchSession(session, participant) {
  const index = session.participants.length;
  session.participants.push(buildSessionParticipant(participant, index));
  return session;
}

// Find an existing forming group session a joiner can slot into: same mode/distance
// (±0.15km) + same slot, still in the 'matched' (pre-start) state, under the size cap,
// and whose anchor pace is within ±GROUP_PACE_MATCH_TOLERANCE_SECONDS of the joiner.
// Returns the session or null. Caller adds exactly one joiner per HTTP call so the
// closest joiner wins the single open seat (closest-first, one at a time).
export function findJoinableGroupSession(store, { distanceKm, slotStartAt, joinerPaceMinutes, now = new Date() } = {}) {
  if (!Number.isFinite(joinerPaceMinutes)) {
    return null;
  }

  const normalizedDistanceKm = distanceKm === undefined || distanceKm === null
    ? null
    : normalizeMatchQueueDistance(distanceKm);
  const sessions = pruneMatchSessions(store, now);

  for (let index = sessions.length - 1; index >= 0; index -= 1) {
    const session = sessions[index];

    if (session.mode !== 'group' || isTestMatchSession(session)) {
      continue;
    }

    if (!Number.isFinite(session.anchorPaceMinutes)) {
      continue;
    }

    if (hydrateMatchSessionState(session, now) !== 'matched') {
      continue;
    }

    if (session.participants.length >= GROUP_MATCH_MAX_PARTICIPANTS) {
      continue;
    }

    if (normalizedDistanceKm !== null && Math.abs(session.distanceKm - normalizedDistanceKm) >= 0.15) {
      continue;
    }

    if (slotStartAt && session.slotStartAt !== slotStartAt) {
      continue;
    }

    const anchorGapSeconds = Math.abs(joinerPaceMinutes - session.anchorPaceMinutes) * 60;

    if (anchorGapSeconds > GROUP_PACE_MATCH_TOLERANCE_SECONDS) {
      continue;
    }

    return session;
  }

  return null;
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
