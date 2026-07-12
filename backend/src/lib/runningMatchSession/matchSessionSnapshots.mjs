import { parsePaceToMinutes } from '../../points.mjs';
import { filterCompetitiveRuns } from '../competitiveRuns.mjs';
import {
  buildLevelLabel,
  buildProgressAveragePaceLabel,
  formatPaceMinutesLabel,
} from '../matchFormatting.mjs';
import { resolveCommonCheckpoint } from '../matchCheckpointHelpers.mjs';
import {
  projectOfficialDistanceKm,
  resolveParticipantLiveStatus,
} from '../matchPureHelpers.mjs';
import { findUserById, getRunsForUser, getUserMetrics } from '../userStoreHelpers.mjs';
import { hydrateMatchSessionState } from './matchSessionCore.mjs';

// The match runner profile feeds ONLY competitive surfaces — duel LP delta
// sizing (matchActionHandlers), matchmaking pace-band/seed compatibility
// (matchPureHelpers), synthetic live standings, and the opponent-visible
// profile card — so it is built from competitive runs only. A health-store
// import can be hand-typed into the platform health app; letting it shape
// pace/level/distance here would let a fabricated import buy easier
// matchmaking or bigger LP wins. An import-only user keeps the neutral
// fallbacks (5.5 pace, zeroed distances) and stays fully matchable.
export function buildMatchRunnerProfile(store, user, runs = getRunsForUser(store, user.id)) {
  const metrics = getUserMetrics(store, user.id);
  const competitiveRuns = filterCompetitiveRuns(runs);
  const recentRuns = competitiveRuns.slice(0, 3);
  const parsedPaces = recentRuns
    .map((run) => parsePaceToMinutes(run.pace))
    .filter((pace) => pace !== null);
  const averagePaceMinutes = parsedPaces.length
    ? parsedPaces.reduce((sum, pace) => sum + pace, 0) / parsedPaces.length
    : 5.5;
  const latestDistanceKm = recentRuns[0]?.distanceKm ?? metrics.competitiveWeekDistanceKm ?? 0;

  return {
    id: user.id,
    name: user.name,
    tag: user.publicTag,
    districtName: user.districtName,
    averagePaceMinutes,
    averagePace: formatPaceMinutesLabel(averagePaceMinutes),
    distanceLevel: metrics.competitiveDistanceLevel,
    levelLabel: buildLevelLabel(metrics.competitiveDistanceLevel),
    weeklyDistanceKm: metrics.competitiveWeekDistanceKm,
    lifetimeDistanceKm: metrics.competitiveLifetimeDistanceKm,
    latestDistanceKm,
  };
}

// Group participants' runs in ONE pass over store.runs (instead of a full filter scan per
// participant) and per-user sort. Array#filter keeps original order and Array#sort is stable,
// so sorting each grouped subset yields exactly what getRunsForUser returns.
function buildRunsByUserId(store) {
  const runsByUserId = new Map();

  for (const run of store.runs) {
    const runs = runsByUserId.get(run.userId);

    if (runs) {
      runs.push(run);
    } else {
      runsByUserId.set(run.userId, [run]);
    }
  }

  for (const runs of runsByUserId.values()) {
    runs.sort((left, right) => right.date.localeCompare(left.date));
  }

  return runsByUserId;
}

function buildParticipantProfileLookups(store) {
  return {
    usersById: new Map(store.users.map((user) => [user.id, user])),
    runsByUserId: buildRunsByUserId(store),
  };
}

export function resolveSessionParticipantProfile(store, participant, lookups = null) {
  if (participant.profileSnapshot) {
    return participant.profileSnapshot;
  }

  if (!lookups) {
    return buildMatchRunnerProfile(store, findUserById(store, participant.userId));
  }

  // Missing map entry falls back to the scanning helper so the 404 behavior stays identical.
  const user = lookups.usersById.get(participant.userId) ?? findUserById(store, participant.userId);

  return buildMatchRunnerProfile(store, user, lookups.runsByUserId.get(participant.userId) ?? []);
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
  // Build the users/runs lookup maps ONCE per call — the per-participant path otherwise
  // re-scans store.users and store.runs for every participant without a profileSnapshot.
  const needsProfileBuild = session.participants.some((participant) => !participant.profileSnapshot);
  const profileLookups = needsProfileBuild ? buildParticipantProfileLookups(store) : null;
  const snapshots = session.participants.map((participant) => {
    const runner = resolveSessionParticipantProfile(store, participant, profileLookups);
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
      checkpoints: Array.isArray(participant.checkpoints) ? participant.checkpoints : undefined,
      officialAveragePace: buildProgressAveragePaceLabel(liveDistanceKm, liveElapsedSeconds),
    };
  });

  const readySnapshots = snapshots.filter((snapshot) => snapshot.hasProgress);
  const liveCheckpointSnapshots = readySnapshots.filter((snapshot) => snapshot.contributesToLiveCheckpoint);
  // CHECKPOINT-FAIR LIVE COMPARE (2026-07-09) — the head-to-head compares BOTH runners at the
  // latest COMMON 10s checkpoint instead of a per-runner linear projection. The active set for
  // the min is the running/background runners with progress (contributesToLiveCheckpoint), the
  // SAME set liveCheckpointSnapshots uses; finished/forfeited/disconnected are excluded so one
  // stale runner cannot pin everyone low. When it resolves (commonMaxIndex >= 0), commonT is the
  // shared officialElapsedSeconds and each active runner's checkpoints[commonMaxIndex] is its
  // officialDistanceKm. It FALLS BACK to the legacy projectOfficialDistanceKm path (below) for
  // any runner without a checkpoint at that index, and entirely for legacy in-flight sessions
  // (checkpoints undefined) or the first 10s before any checkpoint exists. The finisher sort
  // (:~282-307, finishElapsedSeconds) is UNTOUCHED so the win/lose verdict never moves.
  const commonCheckpoint = resolveCommonCheckpoint(
    liveCheckpointSnapshots.map((snapshot) => ({
      userId: snapshot.userId,
      checkpoints: snapshot.checkpoints,
      isActive: true,
    })),
  );
  const hasCommonCheckpoint = commonCheckpoint.commonMaxIndex >= 0;
  const legacyOfficialElapsedSeconds = liveCheckpointSnapshots.length > 0
    ? Math.max(0, Math.min(...liveCheckpointSnapshots.map((snapshot) => snapshot.liveElapsedSeconds)))
    : readySnapshots.length > 0
      ? Math.max(0, Math.max(...readySnapshots.map((snapshot) => snapshot.liveElapsedSeconds)))
      : 0;
  const officialElapsedSeconds = hasCommonCheckpoint
    ? commonCheckpoint.commonT
    : legacyOfficialElapsedSeconds;
  const comparedAt = now.toISOString();

  const rankedSnapshots = snapshots
    .map((snapshot) => {
      const officialReady = officialElapsedSeconds > 0 && snapshot.hasProgress;
      // Prefer this runner's latest-common-checkpoint distance; fall back to the continuous
      // linear projection when it has no checkpoint at the common index (paused/legacy/pre-first
      // checkpoint) so the compare never blanks or reads a fake 0.00.
      const checkpointDistanceKm = hasCommonCheckpoint
        ? commonCheckpoint.distanceByUserId.get(snapshot.userId)
        : undefined;
      return {
        ...snapshot,
        officialReady,
        officialElapsedSeconds,
        officialComparedAt: comparedAt,
        officialDistanceKm: officialReady
          ? typeof checkpointDistanceKm === 'number' && Number.isFinite(checkpointDistanceKm)
            ? Number(Math.max(0, Math.min(session.distanceKm, checkpointDistanceKm)).toFixed(2))
            : projectOfficialDistanceKm(
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
    // Internal-only: the raw per-runner checkpoint grid never leaves the standings builder — the
    // response SHAPE stays byte-identical to pre-checkpoint (only the value behind
    // officialDistanceKm/officialElapsedSeconds changed).
    delete publicSnapshot.checkpoints;
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
