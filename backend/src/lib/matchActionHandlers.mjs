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
  isParticipantSealedDnf,
  pruneMatchSessions,
  sealDuelFallbackResolutionIfElapsed,
} from './runningMatchSessionStoreHelpers.mjs';
import { buildRunningMatchStatusResponse } from './matchResponseBuilders.mjs';
import { pruneMatchRooms } from './matchRoomStoreHelpers.mjs';
import { appendUserNotification } from './userNotifications.mjs';

function applyMatchLpIfComplete(store, session) {
  if (!session || (session.lpApplied && session.resultNotificationApplied)) {
    return;
  }

  const participants = Array.isArray(session.participants) ? session.participants : [];
  const now = new Date();
  if (!participants.length || !participants.every((participant) => isParticipantDoneWithMatch(participant, now))) {
    if (session.isPartyRun) {
      session.lpApplied = true;
    }
    return;
  }

  try {
    const standings = buildOfficialSessionStandings(store, session, now);
    const officialByUserId = new Map(standings.map((standing) => [standing.userId, standing]));
    appendMatchResultNotifications(store, session, participants, officialByUserId);

    if (session.lpApplied) {
      return;
    }

    if (session.isPartyRun) {
      session.lpApplied = true;
      return;
    }

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
      const previousRankState = { ...ensureUserRankState(user) };
      const nextRankState = applyLpDelta(previousRankState, deltaLp);
      user.rankState = {
        tier: nextRankState.tier,
        lp: nextRankState.lp,
      };
      appendRankChangeNotification(store, session, user, deltaLp, previousRankState, user.rankState);
    }
    session.lpApplied = true;
  } catch {
    // Rank updates must never block match completion responses.
  }
}

function getMatchModeLabel(mode) {
  return mode === 'duel' ? '1대1 대결' : '그룹 대결';
}

function appendMatchResultNotifications(store, session, participants, officialByUserId) {
  if (session.resultNotificationApplied) {
    return;
  }

  const modeLabel = getMatchModeLabel(session.mode);

  for (const participant of participants) {
    const standing = officialByUserId.get(participant.userId);
    const rankText = Number.isFinite(standing?.officialRank)
      ? ` ${standing.officialRank}위`
      : '';

    appendUserNotification(store, {
      userId: participant.userId,
      type: 'match_result',
      title: `${modeLabel} 결과`,
      body: `${modeLabel}${rankText} 결과가 확정됐어요.`,
      data: {
        matchId: session.id,
        mode: session.mode,
        ...(Number.isFinite(standing?.officialRank) ? { rank: standing.officialRank } : {}),
        participantCount: participants.length,
      },
    });
  }

  session.resultNotificationApplied = true;
}

function appendRankChangeNotification(store, session, user, deltaLp, previousRankState, nextRankState) {
  const safeDeltaLp = Math.trunc(Number(deltaLp) || 0);

  if (
    safeDeltaLp === 0
    || (
      previousRankState.tier === nextRankState.tier
      && previousRankState.lp === nextRankState.lp
    )
  ) {
    return;
  }

  appendUserNotification(store, {
    userId: user.id,
    type: 'rank_change',
    title: '랭크 LP 변동',
    body: `대결 결과로 랭크 ${safeDeltaLp > 0 ? '+' : ''}${safeDeltaLp} LP가 반영됐어요.`,
    data: {
      matchId: session.id,
      mode: session.mode,
      tier: nextRankState.tier,
      lp: nextRankState.lp,
      lpDelta: safeDeltaLp,
    },
  });
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
  const resolvedAt = new Date(forfeitedAt);
  pruneMatchSessions(store, resolvedAt);
  pruneMatchRooms(store, resolvedAt);

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
  const requestedFinished = alreadyFinished || status === 'finished' || reachedGoalDistance;

  // F4: seal the §B4 fallback FIRST, from raw participant state, BEFORE we apply any
  // finished state. This way a late finish push from the missing runner is blocked even
  // when it is the very first request to arrive after the window elapsed (no poll sealed
  // it yet). A runner the server already SEALED as a DNF must NEVER be marked finished —
  // not finishedAt, not liveStatus='finished', not finishElapsedSeconds — otherwise their
  // late finish would re-enter the standings (via the legacy liveElapsed fallback) and
  // flip the sealed verdict AND the once-only LP application. Their finish is simply
  // ignored; they stay a non-finisher (their reported running/background/paused/etc.).
  if (requestedFinished) {
    sealDuelFallbackResolutionIfElapsed(session, new Date());
  }
  const sealedAsDnf = isParticipantSealedDnf(session, currentParticipant.userId);
  // A sealed DNF runner is never marked finished; downgrade any finish signal to a live,
  // non-terminal status ('running') so they read as a non-finisher. Otherwise honor the
  // finish transition as before. A non-finish status push from a sealed runner passes
  // through unchanged.
  const effectiveStatus = sealedAsDnf
    ? (requestedFinished || status === 'finished' ? 'running' : status)
    : requestedFinished
      ? 'finished'
      : status;

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
    // Freeze the MEASURED finish time once, first-write-wins. The rank key is the
    // runner's OWN slot-anchored elapsed at the finishing sample (the client-reported
    // elapsedSeconds), NOT the server receive time (finishedAt), which is jitter-prone.
    // finishedAt stays for audit but no longer decides the duel.
    //
    // F1: freeze ONLY a POSITIVE measured value. A client-reported elapsedSeconds of 0
    // (or any non-positive/invalid value) must never be frozen as the official finish —
    // otherwise a runner could "win" with a 0-second finish. If no positive value is
    // available yet, leave finishElapsedSeconds null; the standings legacy-fallback still
    // ranks a finished runner via liveElapsedSeconds.
    if (currentParticipant.finishElapsedSeconds === null || currentParticipant.finishElapsedSeconds === undefined) {
      const measured = Number.isInteger(elapsedSeconds) && elapsedSeconds > 0
        ? elapsedSeconds
        : normalizedProgress.elapsedSeconds > 0
          ? normalizedProgress.elapsedSeconds
          : null;
      if (Number.isInteger(measured) && measured > 0) {
        currentParticipant.finishElapsedSeconds = measured;
        // F2: the displayed self-time (liveElapsedSeconds, the value the runner sees and
        // the value buildOfficialSessionStandings reads when no frozen finish exists) must
        // equal the authoritative rank key, so the shown time and the ranked time can never
        // diverge on the finishing push. The already-finished short-circuit in
        // normalizeRunningMatchProgress keeps BOTH frozen on every subsequent push.
        currentParticipant.liveElapsedSeconds = currentParticipant.finishElapsedSeconds;
      }
    }
  }

  if (effectiveStatus === 'running') {
    currentParticipant.finishedAt = null;
  }

  if (effectiveStatus === 'background' || effectiveStatus === 'paused') {
    currentParticipant.finishedAt = null;
  }

  applyMatchLpIfComplete(store, session);
  const response = buildRunningMatchStatusResponse(store, currentUser, {
    mode: session.mode,
    distanceKm: session.distanceKm,
    slotStartAt: session.slotStartAt,
    matchId: session.id,
    sessionOverride: session,
  });
  const resolvedAt = new Date(currentParticipant.liveUpdatedAt);
  pruneMatchSessions(store, resolvedAt);
  pruneMatchRooms(store, resolvedAt);

  return response;
}
