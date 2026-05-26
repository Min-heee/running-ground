import {
  DUEL_MIN_COMPATIBILITY_SCORE,
  GROUP_MIN_COMPATIBILITY_SCORE,
  GROUP_MIN_PARTICIPANTS,
  MATCH_BOOKING_CUTOFF_MS,
  MATCH_TEST_GROUP_MIN_PARTICIPANTS,
} from './matchConstants.mjs';
import {
  buildLevelLabel,
  buildPaceBandLabel,
  formatPaceMinutesLabel,
} from './matchFormatting.mjs';
import {
  buildDistanceRecommendationHint,
  buildOfficialComparisonSummary,
  buildOfficialStandingFields,
  buildQueuedParticipants,
  calculateMatchCompatibilityScore,
  isParticipantDoneWithMatch,
  normalizeMatchQueueDistance,
} from './matchPureHelpers.mjs';
import {
  buildExpirySnapshot,
  buildMatchSlotDateLabel,
  formatDuelSlotLabel as formatDuelSlotLabelFromDateTime,
} from './dateTimeFormatting.mjs';
import {
  buildMatchCancellationDeadline,
  buildTestMatchQueueExpiresAt,
  buildTestMatchStartAt,
  getMatchQueueEntryExpiresAt,
  isTestMatchSession,
} from './matchScheduleHelpers.mjs';
import {
  ensureMatchQueues,
  getMatchQueueEntries,
  removeUsersFromMatchQueue,
  upsertMatchQueueEntry,
} from './matchQueueStoreHelpers.mjs';
import { nextId } from './idHelpers.mjs';
import { findUserById } from './userStoreHelpers.mjs';
import { validateMatchSlotStartAt } from './matchSlotValidation.mjs';
import {
  buildMatchRunnerProfile,
  buildOfficialSessionStandings,
  buildParticipantLiveSnapshot,
  createMatchSession,
  ensureMatchSessions,
  findMatchSessionForUser,
  hydrateMatchSessionState,
  pruneMatchSessions,
  resolveSessionParticipantProfile,
} from './runningMatchSessionStoreHelpers.mjs';
import {
  assertUserCanRequestAnotherMatch,
  syncMatchRooms,
} from './matchRoomStoreHelpers.mjs';

function createSyntheticRunnerProfile(currentRunner, {
  id,
  name,
  paceOffsetSeconds = 0,
  paceSecondsOverride = null,
  weeklyDistanceDeltaKm = 0,
  lifetimeDistanceDeltaKm = 0,
  districtName = '테스트 트랙',
  tag = '#TEST',
}) {
  const resolvedPaceMinutes = paceSecondsOverride === null
    ? currentRunner.averagePaceMinutes + paceOffsetSeconds / 60
    : paceSecondsOverride / 60;
  const averagePaceMinutes = Math.max(3.4, Number(resolvedPaceMinutes.toFixed(2)));
  const lifetimeDistanceKm = Math.max(12, Number((currentRunner.lifetimeDistanceKm + lifetimeDistanceDeltaKm).toFixed(1)));
  const weeklyDistanceKm = Math.max(4, Number((currentRunner.weeklyDistanceKm + weeklyDistanceDeltaKm).toFixed(1)));
  const distanceLevel = Math.max(1, Math.round(lifetimeDistanceKm / 25));

  return {
    id,
    name,
    tag,
    districtName,
    averagePaceMinutes,
    averagePace: formatPaceMinutesLabel(averagePaceMinutes),
    distanceLevel,
    levelLabel: buildLevelLabel(distanceLevel),
    weeklyDistanceKm,
    lifetimeDistanceKm,
    latestDistanceKm: Number(currentRunner.latestDistanceKm.toFixed(1)),
  };
}

function buildTestDuelMatchResponse(store, currentUser, { distanceKm }) {
  const now = new Date();
  const previewSlotStartAt = buildTestMatchStartAt(now);
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const paceBandLabel = buildPaceBandLabel(currentRunner.averagePaceMinutes);
  const levelBandLabel = `${buildLevelLabel(currentRunner.distanceLevel)} 전후`;

  upsertMatchQueueEntry(store, 'duel', currentUser.id, distanceKm, previewSlotStartAt, {
    testMode: true,
    expiresAt: buildTestMatchQueueExpiresAt(now),
  });
  const duelTestPaceSeconds = 380 + Math.floor(Math.random() * 10);
  const syntheticOpponent = createSyntheticRunnerProfile(currentRunner, {
    id: nextId('duel-test-bot'),
    name: '테스트 상대',
    paceSecondsOverride: duelTestPaceSeconds,
    weeklyDistanceDeltaKm: 1.2,
    lifetimeDistanceDeltaKm: 18,
    districtName: '테스트 트랙',
    tag: '#TEST',
  });

  const countdownStartAt = buildTestMatchStartAt(now);
  removeUsersFromMatchQueue(store, 'duel', [currentUser.id]);
  const createdSession = createMatchSession(store, 'duel', distanceKm, countdownStartAt, [
    { id: currentUser.id, seedRank: 1 },
    { id: syntheticOpponent.id, seedRank: 2, profileSnapshot: syntheticOpponent },
  ], {
    isTestMatch: true,
  });

  const opponentParticipant = createdSession.participants.find((participant) => participant.userId === syntheticOpponent.id);
  const opponentRunner = opponentParticipant
    ? resolveSessionParticipantProfile(store, opponentParticipant)
    : syntheticOpponent;
  return {
    success: true,
    matched: true,
    isTestMatch: true,
    requestId: nextId('duel-test-request'),
    distanceKm,
    slotStartAt: countdownStartAt,
    slotLabel: formatDuelSlotLabelFromDateTime(countdownStartAt),
    paceBandLabel,
    levelBandLabel,
    criteriaSummary: `테스트 상대 ${opponentRunner.name}님이 잡혔어요. 30초 뒤 바로 시작해요.`,
    estimatedWaitMinutes: 0,
    opponent: {
      id: opponentRunner.id,
      name: opponentRunner.name,
      tag: opponentRunner.tag,
      districtName: opponentRunner.districtName,
      averagePace: opponentRunner.averagePace,
      levelLabel: opponentRunner.levelLabel,
      weeklyDistanceKm: opponentRunner.weeklyDistanceKm,
      lifetimeDistanceKm: opponentRunner.lifetimeDistanceKm,
      compatibilitySummary: `${opponentRunner.averagePace} 페이스 · ${opponentRunner.levelLabel} · 테스트 상대`,
    },
  };
}

function buildTestGroupMatchResponse(store, currentUser, { distanceKm }) {
  const now = new Date();
  const countdownStartAt = buildTestMatchStartAt(now);
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const paceBandLabel = buildPaceBandLabel(currentRunner.averagePaceMinutes);
  const levelBandLabel = `${buildLevelLabel(currentRunner.distanceLevel)} 전후`;
  const maxGroupSize = 30;
  const targetTestOpponentCount = 25;

  upsertMatchQueueEntry(store, 'group', currentUser.id, distanceKm, countdownStartAt, {
    testMode: true,
    expiresAt: buildTestMatchQueueExpiresAt(now),
  });
  const sessionParticipants = [{ id: currentUser.id, seedRank: 1 }];

  while (sessionParticipants.length - 1 < targetTestOpponentCount) {
    const randomPaceSeconds = 380 + Math.floor(Math.random() * 10);
    const syntheticRunner = createSyntheticRunnerProfile(currentRunner, {
      id: nextId('group-test-bot'),
      name: `테스트 러너 ${sessionParticipants.length}`,
      paceSecondsOverride: randomPaceSeconds,
      weeklyDistanceDeltaKm: 0.8 + sessionParticipants.length,
      lifetimeDistanceDeltaKm: 10 + sessionParticipants.length * 6,
      districtName: '테스트 트랙',
      tag: '#TEST',
    });
    sessionParticipants.push({
      id: syntheticRunner.id,
      seedRank: sessionParticipants.length + 1,
      profileSnapshot: syntheticRunner,
    });
  }

  removeUsersFromMatchQueue(store, 'group', [currentUser.id]);
  const createdSession = createMatchSession(store, 'group', distanceKm, countdownStartAt, sessionParticipants, {
    isTestMatch: true,
  });
  const responseParticipants = createdSession
    ? buildSessionGroupParticipants(store, createdSession, now)
    : [];
  const mySeedRank = responseParticipants.find((participant) => participant.id === currentUser.id)?.seedRank ?? 1;

  return {
    success: true,
    matched: true,
    isTestMatch: true,
    requestId: nextId('group-test-request'),
    distanceKm,
    slotStartAt: countdownStartAt,
    slotLabel: formatDuelSlotLabelFromDateTime(countdownStartAt),
    paceBandLabel,
    levelBandLabel,
    criteriaSummary: `테스트 그룹이 ${responseParticipants.length}명 모였어요. 30초 뒤 바로 시작해요.`,
    estimatedWaitMinutes: 0,
    maxGroupSize,
    participantsCount: responseParticipants.length,
    mySeedRank,
    participants: responseParticipants,
  };
}

function buildSessionGroupParticipants(store, session, now = new Date(), officialStandings = null) {
  const officialByUserId = new Map((officialStandings ?? buildOfficialSessionStandings(store, session, now))
    .map((standing) => [standing.userId, standing]));

  return session.participants
    .map((participant) => {
      const runner = resolveSessionParticipantProfile(store, participant);
      return {
        id: runner.id,
        name: runner.name,
        tag: runner.tag,
        districtName: runner.districtName,
        averagePace: runner.averagePace,
        levelLabel: runner.levelLabel,
        weeklyDistanceKm: runner.weeklyDistanceKm,
        lifetimeDistanceKm: runner.lifetimeDistanceKm,
        seedRank: participant.seedRank,
        seedSummary: `${participant.seedRank}번 시드 · 이번 주 ${runner.weeklyDistanceKm.toFixed(1)}km`,
        accepted: Boolean(participant.acceptedAt),
        ...buildParticipantLiveSnapshot(session, participant, now),
        ...buildOfficialStandingFields(officialByUserId.get(participant.userId)),
      };
    })
    .sort((left, right) => (left.officialRank ?? left.seedRank) - (right.officialRank ?? right.seedRank));
}

function buildSessionDuelOpponent(store, session, currentUserId, now = new Date(), officialStandings = null) {
  const currentUser = findUserById(store, currentUserId);
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const opponentEntry = session.participants.find((participant) => participant.userId !== currentUserId);
  const officialByUserId = new Map((officialStandings ?? buildOfficialSessionStandings(store, session, now))
    .map((standing) => [standing.userId, standing]));

  if (!opponentEntry) {
    return null;
  }

  const opponentRunner = resolveSessionParticipantProfile(store, opponentEntry);
  const compatibilityScore = calculateMatchCompatibilityScore(currentRunner, opponentRunner, session.distanceKm, 'duel');

  return {
    id: opponentRunner.id,
    name: opponentRunner.name,
    tag: opponentRunner.tag,
    districtName: opponentRunner.districtName,
    averagePace: opponentRunner.averagePace,
    levelLabel: opponentRunner.levelLabel,
    weeklyDistanceKm: opponentRunner.weeklyDistanceKm,
    lifetimeDistanceKm: opponentRunner.lifetimeDistanceKm,
    compatibilitySummary: `${opponentRunner.averagePace} 페이스 · ${opponentRunner.levelLabel} · 이번 주 ${opponentRunner.weeklyDistanceKm.toFixed(1)}km · 적합도 ${compatibilityScore.toFixed(0)}점`,
    accepted: Boolean(opponentEntry.acceptedAt),
    ...buildParticipantLiveSnapshot(session, opponentEntry, now),
    ...buildOfficialStandingFields(officialByUserId.get(opponentEntry.userId)),
  };
}

function clearUserTestMatchArtifacts(store, userId) {
  const queues = ensureMatchQueues(store);
  queues.duel = queues.duel.filter((entry) => !(entry.userId === userId && entry.testMode));
  queues.group = queues.group.filter((entry) => !(entry.userId === userId && entry.testMode));

  const sessions = ensureMatchSessions(store);
  store.matchSessions = sessions.filter((session) => {
    if (!isTestMatchSession(session)) {
      return true;
    }

    return !session.participants.some((participant) => participant.userId === userId);
  });
}

function buildQueuedMatchRunnerEntries(store, mode, currentRunner, { distanceKm, slotStartAt, includeCurrentUser = false, testMode = false }) {
  const queueEntries = getMatchQueueEntries(store, mode, distanceKm, slotStartAt, { testMode })
    .filter((entry) => includeCurrentUser || entry.userId !== currentRunner.id);

  return queueEntries.map((queueEntry) => {
    const user = findUserById(store, queueEntry.userId);
    const runner = buildMatchRunnerProfile(store, user);
    const score = runner.id === currentRunner.id
      ? 100
      : calculateMatchCompatibilityScore(currentRunner, runner, distanceKm, mode);

    return {
      queueEntry,
      runner,
      score,
    };
  });
}

export function buildRunningMatchStatusResponse(store, currentUser, { mode, distanceKm, slotStartAt, testMode = false, matchId } = {}) {
  const now = new Date();
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const paceBandLabel = buildPaceBandLabel(currentRunner.averagePaceMinutes);
  const levelBandLabel = `${buildLevelLabel(currentRunner.distanceLevel)} 전후`;
  const session = findMatchSessionForUser(store, mode, currentUser.id, {
    distanceKm,
    slotStartAt,
    testMode,
    matchId,
  });
  const capacity = mode === 'duel' ? 2 : 30;
  const distanceRecommendationHint = buildDistanceRecommendationHint(distanceKm);

  if (session) {
    const state = hydrateMatchSessionState(session, now);
    const isTestMatch = isTestMatchSession(session);
    const readyToStart = new Date(session.slotStartAt).getTime() <= now.getTime();
    const cancelableUntilAt = buildMatchCancellationDeadline(session.slotStartAt, {
      isTestMatch,
    }).toISOString();
    const canCancelReservation = now.getTime() < new Date(cancelableUntilAt).getTime();
    const countdownRemainingSeconds = state === 'matched' && !readyToStart
      ? Math.max(0, Math.ceil((new Date(session.slotStartAt).getTime() - now.getTime()) / 1000))
      : undefined;
    const sessionSlotLabel = formatDuelSlotLabelFromDateTime(session.slotStartAt);
    const officialStandings = buildOfficialSessionStandings(store, session, now);
    const officialComparison = buildOfficialComparisonSummary(officialStandings, currentUser.id);
    const currentParticipant = session.participants.find((participant) => participant.userId === currentUser.id);
    const currentUserLiveSnapshot = currentParticipant
      ? buildParticipantLiveSnapshot(session, currentParticipant, now)
      : null;

    if (mode === 'duel') {
      const opponent = buildSessionDuelOpponent(store, session, currentUser.id, now, officialStandings);
      return {
        success: true,
        serverNow: now.toISOString(),
        mode,
        state,
        ...(isTestMatch ? { isTestMatch: true } : {}),
        matchId: session.id,
        distanceKm: session.distanceKm,
        slotStartAt: session.slotStartAt,
        slotLabel: sessionSlotLabel,
        paceBandLabel,
        levelBandLabel,
        criteriaSummary: isTestMatch
          ? state === 'matched'
            ? `${opponent?.name ?? '상대'}님과 테스트 매치가 잡혔어요. 30초 카운트다운이 끝나면 바로 시작돼요.`
            : '테스트 대결이 시작됐어요. 상대와 거리 차이를 바로 확인할 수 있어요.'
          : state === 'matched'
            ? readyToStart
              ? `매칭이 잡혔어요. ${buildMatchSlotDateLabel(session.slotStartAt)} ${sessionSlotLabel} 대결을 이제 시작할 수 있어요.`
              : `매칭이 잡혔어요. ${buildMatchSlotDateLabel(session.slotStartAt)} ${sessionSlotLabel}에 ${opponent?.name ?? '상대'}님과 1대1로 시작해요.`
            : '이제 실제 러닝 기록이 실시간으로 반영되고 있어요.',
        estimatedWaitMinutes: 0,
        participantCount: session.participants.length,
        acceptedCount: 0,
        capacity,
        userAccepted: true,
        readyToStart,
        ...(currentUserLiveSnapshot?.liveStatus ? { currentUserLiveStatus: currentUserLiveSnapshot.liveStatus } : {}),
        canCancel: state === 'matched' ? canCancelReservation : false,
        cancelableUntilAt,
        ...(countdownRemainingSeconds !== undefined ? {
          countdownRemainingSeconds,
          countdownEndsAt: session.slotStartAt,
        } : {}),
        ...(opponent ? { opponent } : {}),
        ...(officialComparison ? { officialComparison } : {}),
      };
    }

    const participants = buildSessionGroupParticipants(store, session, now, officialStandings);
    const mySeedRank = participants.find((participant) => participant.id === currentUser.id)?.seedRank ?? 1;

      return {
        success: true,
        serverNow: now.toISOString(),
        mode,
        state,
        ...(isTestMatch ? { isTestMatch: true } : {}),
        matchId: session.id,
        distanceKm: session.distanceKm,
        slotStartAt: session.slotStartAt,
        slotLabel: sessionSlotLabel,
        paceBandLabel,
        levelBandLabel,
        criteriaSummary: isTestMatch
          ? state === 'matched'
            ? `테스트 그룹 ${participants.length}명이 모였어요. 30초 카운트다운이 끝나면 바로 시작돼요.`
            : '테스트 그룹 대결이 시작됐어요. 트랙에서 순위를 바로 확인할 수 있어요.'
          : state === 'matched'
            ? readyToStart
              ? `그룹 매칭이 잡혔어요. ${buildMatchSlotDateLabel(session.slotStartAt)} ${sessionSlotLabel} 대결을 이제 시작할 수 있어요.`
              : `그룹 매칭이 잡혔어요. ${buildMatchSlotDateLabel(session.slotStartAt)} ${sessionSlotLabel}에 ${participants.length}명 대결이 열려요.`
            : '이제 그룹 러닝 기록이 실시간으로 반영되고 있어요.',
        estimatedWaitMinutes: 0,
        participantCount: session.participants.length,
        acceptedCount: 0,
        capacity,
        userAccepted: true,
        readyToStart,
        ...(currentUserLiveSnapshot?.liveStatus ? { currentUserLiveStatus: currentUserLiveSnapshot.liveStatus } : {}),
        canCancel: state === 'matched' ? canCancelReservation : false,
        cancelableUntilAt,
        ...(countdownRemainingSeconds !== undefined ? {
          countdownRemainingSeconds,
          countdownEndsAt: session.slotStartAt,
        } : {}),
        participants,
        mySeedRank,
        ...(officialComparison ? { officialComparison } : {}),
      };
  }

  const queuedEntries = buildQueuedMatchRunnerEntries(store, mode, currentRunner, {
    distanceKm,
    slotStartAt,
    includeCurrentUser: true,
    testMode,
  });
  const queuedParticipants = queuedEntries.map((entry) => entry.runner);
  const competitiveThreshold = mode === 'duel' ? DUEL_MIN_COMPATIBILITY_SCORE : GROUP_MIN_COMPATIBILITY_SCORE;
  const competitiveParticipantsCount = testMode
    ? queuedEntries.length
    : queuedEntries.filter((entry) => (
      entry.runner.id === currentRunner.id || entry.score >= competitiveThreshold
    )).length;
  const currentQueueEntry = queuedEntries.find((entry) => entry.runner.id === currentRunner.id)?.queueEntry ?? null;
  const averagePaceMinutes = queuedParticipants.length
    ? queuedParticipants.reduce((sum, runner) => sum + runner.averagePaceMinutes, 0) / queuedParticipants.length
    : null;
  const averagePace = averagePaceMinutes === null ? '신청 없음' : formatPaceMinutesLabel(averagePaceMinutes);
  const participants = mode === 'group' ? buildQueuedParticipants(queuedEntries) : undefined;
  const mySeedRank = participants?.find((participant) => participant.id === currentUser.id)?.seedRank ?? 1;
  const queueExpiresAt = currentQueueEntry
    ? getMatchQueueEntryExpiresAt(currentQueueEntry)
    : null;

  if (currentQueueEntry?.testMode) {
    return {
      success: true,
      serverNow: now.toISOString(),
      mode,
      state: 'waiting',
      isTestMatch: true,
      distanceKm: normalizeMatchQueueDistance(distanceKm),
      slotStartAt: currentQueueEntry.slotStartAt,
      slotLabel: formatDuelSlotLabelFromDateTime(currentQueueEntry.slotStartAt),
      paceBandLabel: averagePaceMinutes === null ? paceBandLabel : buildPaceBandLabel(averagePaceMinutes),
      levelBandLabel,
      criteriaSummary: mode === 'duel'
        ? `테스트 상대를 찾는 중이에요. 다른 러너가 들어오면 수준 상관없이 바로 30초 카운트다운이 시작되고, 최대 30분 동안 계속 매칭돼요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
        : `테스트 그룹을 찾는 중이에요. ${MATCH_TEST_GROUP_MIN_PARTICIPANTS}명만 모이면 수준 상관없이 바로 30초 카운트다운이 시작되고, 최대 30분 동안 계속 매칭돼요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
      estimatedWaitMinutes: queueExpiresAt
        ? Math.max(1, Math.ceil((new Date(queueExpiresAt).getTime() - now.getTime()) / (60 * 1000)))
        : 30,
      participantCount: queuedEntries.length,
      competitiveParticipantsCount,
      acceptedCount: 0,
      capacity,
      userAccepted: false,
      readyToStart: false,
      ...(queueExpiresAt ? buildExpirySnapshot(queueExpiresAt, now) : {}),
      ...(mode === 'duel' ? {
        opponent: undefined,
      } : {
        participants,
        mySeedRank,
      }),
      averagePace,
    };
  }

  return {
    success: true,
    serverNow: now.toISOString(),
    mode,
    state: currentQueueEntry ? 'waiting' : 'idle',
    distanceKm: normalizeMatchQueueDistance(distanceKm),
    slotStartAt,
    slotLabel: formatDuelSlotLabelFromDateTime(slotStartAt),
    paceBandLabel: averagePaceMinutes === null ? paceBandLabel : buildPaceBandLabel(averagePaceMinutes),
    levelBandLabel,
    criteriaSummary: mode === 'duel'
      ? queuedEntries.length
        ? `현재 같은 조건 대기 러너는 ${queuedEntries.length}/${capacity}명이에요. 출발 30분 전까지 잘 맞는 상대를 계속 찾고 있어요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
        : `아직 이 조건으로 대기 중인 러너가 없어요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
      : queuedEntries.length
        ? `현재 실제 대기열은 ${queuedEntries.length}/${capacity}명이고, 비슷한 러너는 ${competitiveParticipantsCount}/${capacity}명이에요.${competitiveParticipantsCount < GROUP_MIN_PARTICIPANTS ? ` 최소 ${GROUP_MIN_PARTICIPANTS}명은 모여야 시작해요.` : ''} 출발 30분 전까지 자동으로 계속 맞춰봐요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
        : `아직 이 조건으로 대기 중인 그룹이 없어요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
    estimatedWaitMinutes: Math.max(1, Math.ceil((new Date(slotStartAt).getTime() - MATCH_BOOKING_CUTOFF_MS - now.getTime()) / (60 * 1000))),
    participantCount: queuedEntries.length,
    competitiveParticipantsCount,
    acceptedCount: 0,
    capacity,
    userAccepted: false,
    readyToStart: false,
    ...(queueExpiresAt ? buildExpirySnapshot(queueExpiresAt, now) : {}),
    ...(mode === 'duel' ? {
      opponent: undefined,
    } : {
      participants,
      mySeedRank,
    }),
    averagePace,
  };
}

export function buildDuelMatchResponse(store, currentUser, { distanceKm, slotStartAt, testMode = false }) {
  if (testMode) {
    clearUserTestMatchArtifacts(store, currentUser.id);
    assertUserCanRequestAnotherMatch(store, currentUser);
    return buildTestDuelMatchResponse(store, currentUser, { distanceKm, slotStartAt });
  }

  assertUserCanRequestAnotherMatch(store, currentUser);

  const normalizedSlotStartAt = validateMatchSlotStartAt(slotStartAt);
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const slotLabel = formatDuelSlotLabelFromDateTime(normalizedSlotStartAt);
  const paceBandLabel = buildPaceBandLabel(currentRunner.averagePaceMinutes);
  const levelBandLabel = `${buildLevelLabel(currentRunner.distanceLevel)} 전후`;
  const distanceRecommendationHint = buildDistanceRecommendationHint(distanceKm);

  upsertMatchQueueEntry(store, 'duel', currentUser.id, distanceKm, normalizedSlotStartAt);
  const queuedEntries = buildQueuedMatchRunnerEntries(store, 'duel', currentRunner, {
    distanceKm,
    slotStartAt: normalizedSlotStartAt,
  }).sort((left, right) => right.score - left.score);

  if (!queuedEntries.length) {
    return {
      success: true,
      matched: false,
      requestId: nextId('duel-request'),
      distanceKm,
      slotStartAt: normalizedSlotStartAt,
      slotLabel,
      paceBandLabel,
      levelBandLabel,
      criteriaSummary: `나와 비슷한 페이스를 가진 상대를 계속 찾고 있어요. 출발 30분 전까지만 매칭돼요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
      estimatedWaitMinutes: 15,
    };
  }

  const bestCandidate = queuedEntries[0];

  if (!bestCandidate || bestCandidate.score < DUEL_MIN_COMPATIBILITY_SCORE) {
    return {
      success: true,
      matched: false,
      requestId: nextId('duel-request'),
      distanceKm,
      slotStartAt: normalizedSlotStartAt,
      slotLabel,
      paceBandLabel,
      levelBandLabel,
      criteriaSummary: `신청자는 있지만 아직 바로 붙일 만큼 페이스와 레벨이 잘 맞지 않아요. 출발 30분 전까지 계속 찾아볼게요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
      estimatedWaitMinutes: 10,
    };
  }

  removeUsersFromMatchQueue(store, 'duel', [currentUser.id, bestCandidate.runner.id]);
  createMatchSession(store, 'duel', distanceKm, normalizedSlotStartAt, [
    { id: currentUser.id, seedRank: 1 },
    { id: bestCandidate.runner.id, seedRank: 2 },
  ]);

  const opponent = bestCandidate.runner;
  return {
    success: true,
    matched: true,
    requestId: nextId('duel-request'),
    distanceKm,
    slotStartAt: normalizedSlotStartAt,
    slotLabel,
    paceBandLabel,
    levelBandLabel,
    criteriaSummary: `${buildMatchSlotDateLabel(normalizedSlotStartAt)} ${slotLabel}에 비슷한 페이스 상대와 매칭이 잡혔어요.`,
    estimatedWaitMinutes: 0,
    opponent: {
      id: opponent.id,
      name: opponent.name,
      tag: opponent.tag,
      districtName: opponent.districtName,
      averagePace: opponent.averagePace,
      levelLabel: opponent.levelLabel,
      weeklyDistanceKm: opponent.weeklyDistanceKm,
      lifetimeDistanceKm: opponent.lifetimeDistanceKm,
      compatibilitySummary: `${opponent.averagePace} 페이스 · ${opponent.levelLabel} · 이번 주 ${opponent.weeklyDistanceKm.toFixed(1)}km · 적합도 ${bestCandidate.score.toFixed(0)}점`,
    },
  };
}

export function buildGroupMatchResponse(store, currentUser, { distanceKm, slotStartAt, testMode = false }) {
  if (testMode) {
    clearUserTestMatchArtifacts(store, currentUser.id);
    assertUserCanRequestAnotherMatch(store, currentUser);
    return buildTestGroupMatchResponse(store, currentUser, { distanceKm, slotStartAt });
  }

  assertUserCanRequestAnotherMatch(store, currentUser);

  const maxGroupSize = 30;
  const normalizedSlotStartAt = validateMatchSlotStartAt(slotStartAt);
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const slotLabel = formatDuelSlotLabelFromDateTime(normalizedSlotStartAt);
  const paceBandLabel = buildPaceBandLabel(currentRunner.averagePaceMinutes);
  const levelBandLabel = `${buildLevelLabel(currentRunner.distanceLevel)} 전후`;
  const distanceRecommendationHint = buildDistanceRecommendationHint(distanceKm);

  upsertMatchQueueEntry(store, 'group', currentUser.id, distanceKm, normalizedSlotStartAt);
  const queuedEntries = buildQueuedMatchRunnerEntries(store, 'group', currentRunner, {
    distanceKm,
    slotStartAt: normalizedSlotStartAt,
    includeCurrentUser: true,
  }).sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return new Date(left.queueEntry.requestedAt).getTime() - new Date(right.queueEntry.requestedAt).getTime();
  });

  const compatibleEntries = queuedEntries
    .filter((entry) => entry.runner.id === currentRunner.id || entry.score >= GROUP_MIN_COMPATIBILITY_SCORE)
    .slice(0, maxGroupSize);
  const participants = buildQueuedParticipants(compatibleEntries);
  const mySeedRank = participants.find((participant) => participant.id === currentRunner.id)?.seedRank ?? 1;

  if (participants.length < GROUP_MIN_PARTICIPANTS) {
    return {
      success: true,
      matched: false,
      requestId: nextId('group-request'),
      distanceKm,
      slotStartAt: normalizedSlotStartAt,
      slotLabel,
      paceBandLabel,
      levelBandLabel,
      criteriaSummary: `나와 비슷한 페이스 러너를 계속 모으는 중이에요. 최소 ${GROUP_MIN_PARTICIPANTS}명은 모여야 하고, 출발 30분 전까지만 매칭돼요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
      estimatedWaitMinutes: 10,
      maxGroupSize,
      participantsCount: participants.length,
      mySeedRank,
      participants,
    };
  }

  removeUsersFromMatchQueue(store, 'group', participants.map((participant) => participant.id));
  createMatchSession(store, 'group', distanceKm, normalizedSlotStartAt, participants);

  return {
    success: true,
    matched: true,
    requestId: nextId('group-request'),
    distanceKm,
    slotStartAt: normalizedSlotStartAt,
    slotLabel,
    paceBandLabel,
    levelBandLabel,
    criteriaSummary: `${buildMatchSlotDateLabel(normalizedSlotStartAt)} ${slotLabel}에 ${participants.length}명 그룹 대결이 잡혔어요.`,
    estimatedWaitMinutes: 0,
    maxGroupSize,
    participantsCount: participants.length,
    mySeedRank,
    participants,
  };
}

export function buildMatchDemandSummaryResponse(store, currentUser, { mode, distanceKm, slotStartAt }) {
  const normalizedSlotStartAt = validateMatchSlotStartAt(slotStartAt);
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const capacity = mode === 'duel' ? 2 : 30;
  const competitiveThreshold = mode === 'duel' ? DUEL_MIN_COMPATIBILITY_SCORE : GROUP_MIN_COMPATIBILITY_SCORE;
  const queuedEntries = buildQueuedMatchRunnerEntries(store, mode, currentRunner, {
    distanceKm,
    slotStartAt: normalizedSlotStartAt,
    includeCurrentUser: true,
  });
  const queuedParticipants = queuedEntries.map((entry) => entry.runner);
  const competitiveParticipantsCount = queuedEntries
    .filter((entry) => entry.runner.id === currentRunner.id || entry.score >= competitiveThreshold)
    .length;
  const participantsCount = queuedEntries.length;
  const averagePaceMinutes = queuedParticipants.length
    ? queuedParticipants.reduce((sum, runner) => sum + runner.averagePaceMinutes, 0) / queuedParticipants.length
    : null;
  const distanceRecommendationHint = buildDistanceRecommendationHint(distanceKm);
  const averagePace = averagePaceMinutes === null ? '신청 없음' : formatPaceMinutesLabel(averagePaceMinutes);

  return {
    success: true,
    mode,
    distanceKm,
    slotStartAt: normalizedSlotStartAt,
    slotLabel: formatDuelSlotLabelFromDateTime(normalizedSlotStartAt),
    averagePace,
    participantsCount,
    competitiveParticipantsCount,
    capacity,
    fillRatioLabel: `${participantsCount}/${capacity}`,
    paceBandLabel: averagePaceMinutes === null ? '대기 없음' : buildPaceBandLabel(averagePaceMinutes),
    summaryText: mode === 'duel'
      ? participantsCount
        ? `현재 실제 신청은 ${participantsCount}/${capacity}명이고, 바로 붙일 만한 러너는 ${competitiveParticipantsCount}/${capacity}명이에요. 출발 30분 전까지 자동으로 계속 맞춰봐요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
        : `아직 이 시간대 신청이 없어요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
      : participantsCount
        ? `현재 실제 신청은 ${participantsCount}/${capacity}명이고, 비슷한 러너는 ${competitiveParticipantsCount}/${capacity}명이에요.${competitiveParticipantsCount < GROUP_MIN_PARTICIPANTS ? ` 최소 ${GROUP_MIN_PARTICIPANTS}명은 모여야 시작해요.` : ''} 출발 30분 전까지 자동으로 계속 맞춰봐요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
        : `아직 이 시간대 신청이 없어요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
  };
}

export function buildUpcomingRunningMatchesResponse(store, currentUser) {
  const now = new Date();
  const rooms = syncMatchRooms(store, now);
  const sessions = pruneMatchSessions(store)
    .filter((session) => session.participants.some((participant) => (
      participant.userId === currentUser.id
      && !isParticipantDoneWithMatch(participant, now)
    )))
    .map((session) => {
      const state = hydrateMatchSessionState(session, now);

      if (!['matched', 'active'].includes(state)) {
        return null;
      }

      const linkedRoom = rooms.find((room) => (
        room.linkedMatchId === session.id
        && room.participants.some((participant) => participant.userId === currentUser.id)
      ));

      if (session.mode === 'duel') {
        const opponent = buildSessionDuelOpponent(store, session, currentUser.id, now);
        const isTestMatch = isTestMatchSession(session);
        const cancelableUntilAt = buildMatchCancellationDeadline(session.slotStartAt, { isTestMatch }).toISOString();
        return {
          matchId: session.id,
          ...(linkedRoom ? { roomId: linkedRoom.id } : {}),
          mode: 'duel',
          ...(isTestMatch ? { isTestMatch: true } : {}),
          distanceKm: session.distanceKm,
          slotStartAt: session.slotStartAt,
          slotLabel: formatDuelSlotLabelFromDateTime(session.slotStartAt),
          status: state,
          participantCount: 2,
          counterpartLabel: opponent?.name ?? '상대 미정',
          summary: `${buildMatchSlotDateLabel(session.slotStartAt)} ${formatDuelSlotLabelFromDateTime(session.slotStartAt)} · ${session.distanceKm.toFixed(1)}km`,
          canCancel: state === 'matched' && now.getTime() < new Date(cancelableUntilAt).getTime(),
          cancelableUntilAt,
        };
      }

      const participants = buildSessionGroupParticipants(store, session, now);
      const isTestMatch = isTestMatchSession(session);
      const cancelableUntilAt = buildMatchCancellationDeadline(session.slotStartAt, { isTestMatch }).toISOString();
      return {
        matchId: session.id,
        ...(linkedRoom ? { roomId: linkedRoom.id } : {}),
        mode: 'group',
        ...(isTestMatch ? { isTestMatch: true } : {}),
        distanceKm: session.distanceKm,
        slotStartAt: session.slotStartAt,
        slotLabel: formatDuelSlotLabelFromDateTime(session.slotStartAt),
        status: state,
        participantCount: participants.length,
        counterpartLabel: `${participants.length}명 그룹`,
        summary: `${buildMatchSlotDateLabel(session.slotStartAt)} ${formatDuelSlotLabelFromDateTime(session.slotStartAt)} · ${session.distanceKm.toFixed(1)}km`,
        canCancel: state === 'matched' && now.getTime() < new Date(cancelableUntilAt).getTime(),
        cancelableUntilAt,
      };
    })
    .filter(Boolean)
    .sort((left, right) => new Date(left.slotStartAt).getTime() - new Date(right.slotStartAt).getTime());

  return {
    serverNow: now.toISOString(),
    items: sessions,
  };
}
