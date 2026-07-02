import { parsePaceToMinutes } from '../../points.mjs';
import {
  buildLevelLabel,
  buildProgressAveragePaceLabel,
  formatPaceMinutesLabel,
} from '../matchFormatting.mjs';
import {
  projectOfficialDistanceKm,
  resolveParticipantLiveStatus,
} from '../matchPureHelpers.mjs';
import { findUserById, getRunsForUser, getUserMetrics } from '../userStoreHelpers.mjs';
import { hydrateMatchSessionState } from './matchSessionCore.mjs';

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
