import { parsePaceToMinutes } from '../points.mjs';
import {
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

    return {
      userId: participant.userId,
      name: runner.name,
      seedRank: participant.seedRank,
      liveDistanceKm,
      liveElapsedSeconds,
      liveStatus,
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

      if (left.liveStatus === 'forfeited' || right.liveStatus === 'forfeited') {
        return left.liveStatus === 'forfeited' ? 1 : -1;
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
