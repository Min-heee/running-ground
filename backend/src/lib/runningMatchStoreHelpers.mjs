import { ApiError } from '../response/httpResponse.mjs';
import { MATCH_GOAL_DISTANCE_TOLERANCE_KM } from './matchConstants.mjs';
import {
  isParticipantDoneWithMatch,
  normalizeMatchQueueDistance,
  resolveParticipantLiveStatus,
} from './matchPureHelpers.mjs';
import {
  buildMatchCancellationDeadline,
  buildTestMatchQueueExpiresAt,
  buildTestMatchStartAt,
  isTestMatchSession,
} from './matchScheduleHelpers.mjs';
import {
  getMatchQueueEntries,
  removeUsersFromMatchQueue,
  upsertMatchQueueEntry,
} from './matchQueueStoreHelpers.mjs';
import { normalizeRunningMatchProgress } from './matchProgressStoreHelpers.mjs';
import {
  applyLpDelta,
  resolveDuelMatchLpDeltas,
  resolveGroupMatchLpDelta,
} from './rankSystem.mjs';
import { ensureUserRankState, findUserById } from './userStoreHelpers.mjs';
import {
  buildMatchRunnerProfile,
  buildOfficialSessionStandings,
  ensureMatchSessions,
  findMatchSessionById,
  findMatchSessionForUser,
  hydrateMatchSessionState,
} from './runningMatchSessionStoreHelpers.mjs';
import { buildRunningMatchStatusResponse } from './matchResponseBuilders.mjs';
export { validateMatchSlotStartAt } from './matchSlotValidation.mjs';
export {
  buildDuelMatchResponse,
  buildGroupMatchResponse,
  buildMatchDemandSummaryResponse,
  buildRunningMatchStatusResponse,
  buildUpcomingRunningMatchesResponse,
} from './matchResponseBuilders.mjs';
export {
  acknowledgeRunningMatchRoomCountdown,
  buildRunningMatchRoomResponse,
  cleanupStaleRunningMatchRoomState,
  createRunningMatchRoom,
  findRunningMatchRoomForUser,
  findRunningMatchRoomInviteInboxForUser,
  joinRunningMatchRoom,
  leaveRunningMatchRoom,
  startRunningMatchRoom,
  updateRunningMatchRoom,
  updateRunningMatchRoomReady,
} from './matchRoomStoreHelpers.mjs';

function applyMatchLpIfComplete(store, session) {
  if (!session || session.lpApplied) {
    return;
  }

  const participants = Array.isArray(session.participants) ? session.participants : [];
  const now = new Date();
  if (!participants.length || !participants.every((participant) => isParticipantDoneWithMatch(participant, now))) {
    return;
  }

  try {
    const standings = buildOfficialSessionStandings(store, session, now);
    const officialByUserId = new Map(standings.map((standing) => [standing.userId, standing]));
    let updates;

    if (session.mode === 'duel' && participants.length === 2) {
      const winnerStanding = standings.find((standing) => standing.officialRank === 1);
      const loserStanding = standings.find((standing) => standing.officialRank === 2);

      if (!winnerStanding || !loserStanding) {
        return;
      }

      const winner = findUserById(store, winnerStanding.userId);
      const loser = findUserById(store, loserStanding.userId);
      const winnerPaceSecPerKm = buildMatchRunnerProfile(store, winner).averagePaceMinutes * 60;
      const loserPaceSecPerKm = buildMatchRunnerProfile(store, loser).averagePaceMinutes * 60;
      const { winnerLpDelta, loserLpDelta } = resolveDuelMatchLpDeltas({
        winnerPaceSecPerKm,
        loserPaceSecPerKm,
      });

      updates = [
        { user: winner, deltaLp: winnerLpDelta },
        { user: loser, deltaLp: loserLpDelta },
      ];
    } else {
      updates = participants.map((participant) => {
        const user = findUserById(store, participant.userId);
        const placement = officialByUserId.get(participant.userId)?.officialRank;
        return {
          user,
          deltaLp: resolveGroupMatchLpDelta({
            placement,
            totalParticipants: participants.length,
          }),
        };
      });
    }

    for (const { user, deltaLp } of updates) {
      const nextRankState = applyLpDelta(ensureUserRankState(user), deltaLp);
      user.rankState = {
        tier: nextRankState.tier,
        lp: nextRankState.lp,
      };
    }
    session.lpApplied = true;
  } catch {
    // Rank updates must never block match completion responses.
  }
}

export function leaveRunningMatch(store, currentUser, { matchId }) {
  const session = findMatchSessionById(store, matchId);

  if (!session) {
    return { success: true };
  }

  const currentParticipant = session.participants.find((participant) => participant.userId === currentUser.id);

  if (!currentParticipant) {
    return { success: true };
  }

  const state = hydrateMatchSessionState(session);

  if (!['matched', 'active'].includes(state)) {
    throw new ApiError(400, '매칭이 잡힌 뒤에만 혼자 계속 달릴 수 있어.');
  }

  const forfeitedAt = new Date().toISOString();
  currentParticipant.liveStatus = 'forfeited';
  currentParticipant.liveUpdatedAt = forfeitedAt;
  currentParticipant.forfeitedAt = forfeitedAt;

  applyMatchLpIfComplete(store, session);

  return { success: true };
}

export function acceptRunningMatch(store, currentUser, matchId) {
  const session = findMatchSessionById(store, matchId);

  if (!session || !session.participants.some((participant) => participant.userId === currentUser.id)) {
    throw new ApiError(404, '수락할 매치를 찾지 못했어.');
  }

  return buildRunningMatchStatusResponse(store, currentUser, {
    mode: session.mode,
    distanceKm: session.distanceKm,
    slotStartAt: session.slotStartAt,
    testMode: isTestMatchSession(session),
  });
}

export function cancelRunningMatch(store, currentUser, { mode, distanceKm, slotStartAt, matchId, testMode = false }) {
  const normalizedDistanceKm = normalizeMatchQueueDistance(distanceKm);
  const queueEntries = getMatchQueueEntries(store, mode, normalizedDistanceKm, slotStartAt, { testMode });
  const session = matchId
    ? findMatchSessionById(store, matchId)
    : findMatchSessionForUser(store, mode, currentUser.id, { distanceKm: normalizedDistanceKm, slotStartAt, testMode });

  removeUsersFromMatchQueue(store, mode, [currentUser.id]);

  if (session && session.participants.some((participant) => participant.userId === currentUser.id)) {
    const state = hydrateMatchSessionState(session);

    if (state === 'active') {
      throw new ApiError(400, '이미 출발한 매치는 취소할 수 없어.');
    }

    if (state === 'matched') {
      const cancellationDeadline = buildMatchCancellationDeadline(session.slotStartAt, {
        isTestMatch: isTestMatchSession(session),
      });

      if (Date.now() >= cancellationDeadline.getTime()) {
        throw new ApiError(400, isTestMatchSession(session)
          ? '테스트 카운트다운이 시작된 뒤에는 취소할 수 없어.'
          : '출발 1시간 전부터는 예약을 취소할 수 없어.');
      }
    }

    const requeuedParticipants = session.participants
      .filter((participant) => participant.userId !== currentUser.id)
      .filter((participant) => !participant.profileSnapshot)
      .map((participant) => findUserById(store, participant.userId));

    store.matchSessions = ensureMatchSessions(store).filter((entry) => entry.id !== session.id);

    for (const participant of requeuedParticipants) {
      const nextTestSlotStartAt = buildTestMatchStartAt();
      upsertMatchQueueEntry(store, mode, participant.id, session.distanceKm, isTestMatchSession(session) ? nextTestSlotStartAt : session.slotStartAt, isTestMatchSession(session)
        ? {
            testMode: true,
            expiresAt: buildTestMatchQueueExpiresAt(),
          }
        : {});
    }

    return { success: true };
  }

  if (!queueEntries.some((entry) => entry.userId === currentUser.id)) {
    return { success: true };
  }

  return { success: true };
}

export function updateRunningMatchProgress(store, currentUser, { matchId, distanceKm, elapsedSeconds, currentPace, status }) {
  const session = findMatchSessionById(store, matchId);

  if (!session || !session.participants.some((participant) => participant.userId === currentUser.id)) {
    throw new ApiError(404, '진행 상태를 반영할 매치를 찾지 못했어.');
  }

  const sessionState = hydrateMatchSessionState(session);

  if (sessionState === 'matched' && !buildRunningMatchStatusResponse(store, currentUser, {
    mode: session.mode,
    distanceKm: session.distanceKm,
    slotStartAt: session.slotStartAt,
    testMode: isTestMatchSession(session),
  }).readyToStart) {
    throw new ApiError(400, '예약된 시작 시간이 아직 되지 않았어.');
  }

  if (!['matched', 'active'].includes(sessionState)) {
    throw new ApiError(400, '아직 시작 전인 매치에는 진행 상태를 반영할 수 없어.');
  }

  const currentParticipant = session.participants.find((participant) => participant.userId === currentUser.id);

  if (resolveParticipantLiveStatus(currentParticipant) === 'forfeited') {
    return buildRunningMatchStatusResponse(store, currentUser, {
      mode: session.mode,
      distanceKm: session.distanceKm,
      slotStartAt: session.slotStartAt,
    });
  }

  const normalizedProgress = normalizeRunningMatchProgress(session, currentParticipant, {
    distanceKm,
    elapsedSeconds,
  }, new Date());
  // The client sends status='finished' when its local distance reaches the
  // configured goal. The server keeps this strict distance fallback for exact
  // progress uploads and makes finish irreversible against stale heartbeats.
  const reachedGoalDistance = normalizedProgress.distanceKm >= session.distanceKm - MATCH_GOAL_DISTANCE_TOLERANCE_KM;
  const alreadyFinished = currentParticipant.liveStatus === 'finished' || Boolean(currentParticipant.finishedAt);
  const effectiveStatus = alreadyFinished || status === 'finished' || reachedGoalDistance ? 'finished' : status;

  currentParticipant.liveDistanceKm = normalizedProgress.distanceKm;
  currentParticipant.liveElapsedSeconds = normalizedProgress.elapsedSeconds;
  currentParticipant.livePace = currentPace;
  currentParticipant.liveUpdatedAt = new Date().toISOString();
  currentParticipant.liveStatus = effectiveStatus;
  if (!session.startedAt) {
    session.startedAt = currentParticipant.liveUpdatedAt;
  }

  if (effectiveStatus === 'finished') {
    currentParticipant.finishedAt = currentParticipant.finishedAt ?? currentParticipant.liveUpdatedAt;
  }

  if (effectiveStatus === 'running') {
    currentParticipant.finishedAt = null;
  }

  if (effectiveStatus === 'background' || effectiveStatus === 'paused') {
    currentParticipant.finishedAt = null;
  }

  applyMatchLpIfComplete(store, session);

  return buildRunningMatchStatusResponse(store, currentUser, {
    mode: session.mode,
    distanceKm: session.distanceKm,
    slotStartAt: session.slotStartAt,
    matchId: session.id,
  });
}
