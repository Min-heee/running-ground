import { parsePaceToMinutes } from '../points.mjs';
import { ApiError, logBackendInfo } from '../response/httpResponse.mjs';
import {
  DUEL_MIN_COMPATIBILITY_SCORE,
  GROUP_MIN_COMPATIBILITY_SCORE,
  GROUP_MIN_PARTICIPANTS,
  MATCH_BOOKING_CUTOFF_MS,
  MATCH_BOOKING_WINDOW_DAYS,
  MATCH_ROOM_HOST_LOADING_SECONDS,
  MATCH_ROOM_HOST_START_DELAY_SECONDS,
  MATCH_ROOM_IDLE_TTL_MS,
  MATCH_SESSION_ACTIVE_TTL_MS,
  MATCH_SESSION_UNSTARTED_ACTIVE_GRACE_MS,
  MATCH_TEST_GROUP_MIN_PARTICIPANTS,
} from './matchConstants.mjs';
import {
  buildLevelLabel,
  buildLiveRunShareLockMessage,
  buildPaceBandLabel,
  buildProgressAveragePaceLabel,
  buildSingleMatchLockMessage,
  formatPaceMinutesLabel,
} from './matchFormatting.mjs';
import {
  areAllRunningMatchRoomGuestsReady,
  areAllRunningMatchRoomParticipantsCountdownReady,
  buildDistanceRecommendationHint,
  buildMatchRoomInviteLink,
  buildOfficialComparisonSummary,
  buildOfficialStandingFields,
  buildQueuedParticipants,
  calculateMatchCompatibilityScore,
  getMatchRoomMinParticipants,
  isMatchRoomVisibleToUser,
  isParticipantDoneWithMatch,
  normalizeMatchQueueDistance,
  normalizeMatchRoomMaxParticipants,
  projectOfficialDistanceKm,
  resolveParticipantLiveStatus,
  shouldClearLiveRunShareEntry,
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
  isMatchSlotClosed,
  isTestMatchSession,
} from './matchScheduleHelpers.mjs';
import {
  countUserQueueRefs,
  ensureMatchQueues,
  findAnyQueuedMatchEntryForUser,
  getMatchQueueEntries,
  pruneMatchQueues,
  removeUsersFromMatchQueue,
  upsertMatchQueueEntry,
} from './matchQueueStoreHelpers.mjs';
import { normalizeRunningMatchProgress } from './matchProgressStoreHelpers.mjs';
import { nextId } from './idHelpers.mjs';
import { areFriends } from './socialStoreHelpers.mjs';
import { findUserById, getRunsForUser, getUserMetrics } from './userStoreHelpers.mjs';

export function validateMatchSlotStartAt(slotStartAt, now = new Date()) {
  const slotStart = new Date(slotStartAt);

  if (Number.isNaN(slotStart.getTime())) {
    throw new ApiError(400, '매칭 시작 시간이 올바르지 않아.');
  }

  if (slotStart.getMinutes() !== 0 || slotStart.getSeconds() !== 0 || slotStart.getMilliseconds() !== 0) {
    throw new ApiError(400, '매칭 시간은 1시간 단위로만 선택할 수 있어.');
  }

  const maxSelectableAt = new Date(now.getTime() + MATCH_BOOKING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  if (slotStart.getTime() > maxSelectableAt.getTime()) {
    throw new ApiError(400, '매칭은 오늘부터 1주일 안의 시간대까지만 예약할 수 있어.');
  }

  if (isMatchSlotClosed(slotStartAt, now)) {
    throw new ApiError(400, '이 시간대는 출발 30분 전이 지나서 더 이상 선택할 수 없어.');
  }

  return slotStart.toISOString();
}

function validateRequiredString(value, message) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, message);
  }

  return value.trim();
}

function validateMatchSlotInput(value) {
  return validateMatchSlotStartAt(
    validateRequiredString(value, '매칭 시간대를 선택해줘.'),
  );
}

function buildMatchRunnerProfile(store, user) {
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

function resolveSessionParticipantProfile(store, participant) {
  if (participant.profileSnapshot) {
    return participant.profileSnapshot;
  }

  return buildMatchRunnerProfile(store, findUserById(store, participant.userId));
}

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

function ensureMatchSessions(store) {
  if (!Array.isArray(store.matchSessions)) {
    store.matchSessions = [];
  }

  return store.matchSessions;
}

function hydrateMatchSessionState(session, now = new Date()) {
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

function pruneMatchSessions(store, now = new Date()) {
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

function createMatchSession(store, mode, distanceKm, slotStartAt, participants, options = {}) {
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

function ensureMatchRooms(store) {
  if (!Array.isArray(store.matchRooms)) {
    store.matchRooms = [];
  }

  return store.matchRooms;
}

function createMatchRoomInviteToken(store) {
  const rooms = ensureMatchRooms(store);
  const existingTokens = new Set(rooms.map((room) => String(room.inviteToken ?? '').toUpperCase()).filter(Boolean));

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const token = Math.random().toString(36).slice(2, 8).toUpperCase();

    if (!existingTokens.has(token)) {
      return token;
    }
  }

  return nextId('room-invite').replace(/[^A-Z0-9]/gi, '').slice(-8).toUpperCase();
}

function pruneMatchRooms(store, now = new Date()) {
  const rooms = ensureMatchRooms(store);
  const activeUserIds = new Set(store.users.map((user) => user.id));
  const nowMs = now.getTime();

  store.matchRooms = rooms.filter((room) => {
    if (!room || typeof room !== 'object') {
      return false;
    }

    if (!room.hostUserId || !activeUserIds.has(room.hostUserId)) {
      return false;
    }

    if (!Array.isArray(room.participants) || room.participants.length === 0) {
      return false;
    }

    room.participants = room.participants.filter((participant) => activeUserIds.has(participant.userId));
    room.invitedFriendIds = Array.isArray(room.invitedFriendIds)
      ? room.invitedFriendIds.filter((userId) => activeUserIds.has(userId) && userId !== room.hostUserId)
      : [];

    if (!room.participants.some((participant) => participant.userId === room.hostUserId)) {
      return false;
    }

    if (room.linkedMatchId) {
      const linkedSession = findMatchSessionById(store, room.linkedMatchId);

      if (!linkedSession) {
        return false;
      }

      const linkedState = hydrateMatchSessionState(linkedSession, now);
      return linkedState === 'matched' || linkedState === 'active';
    }

    if (room.startMode === 'scheduled') {
      const slotStartAtMs = new Date(room.slotStartAt).getTime();
      return Number.isFinite(slotStartAtMs) && slotStartAtMs + MATCH_SESSION_ACTIVE_TTL_MS > nowMs;
    }

    const createdAtMs = new Date(room.createdAt).getTime();
    return Number.isFinite(createdAtMs) && createdAtMs + MATCH_ROOM_IDLE_TTL_MS > nowMs;
  });

  return store.matchRooms;
}

function getMatchRoomLinkedSession(room, store) {
  if (!room?.linkedMatchId) {
    return null;
  }

  return findMatchSessionById(store, room.linkedMatchId);
}

function getRunningMatchRoomState(room, store, now = new Date()) {
  const linkedSession = getMatchRoomLinkedSession(room, store);

  if (!linkedSession) {
    return 'waiting';
  }

  if (
    room.startMode === 'host'
    && !room.countdownArmedAt
    && !areAllRunningMatchRoomParticipantsCountdownReady(room)
  ) {
    return 'arming';
  }

  const linkedState = hydrateMatchSessionState(linkedSession, now);

  if (linkedState === 'active') {
    return 'active';
  }

  if (linkedState === 'matched') {
    const remainingSeconds = Math.max(0, Math.ceil((new Date(linkedSession.slotStartAt).getTime() - now.getTime()) / 1000));

    if (room.startMode === 'host' && remainingSeconds > MATCH_ROOM_HOST_START_DELAY_SECONDS) {
      return 'arming';
    }

    return remainingSeconds <= MATCH_ROOM_HOST_START_DELAY_SECONDS ? 'countdown' : 'waiting';
  }

  return 'waiting';
}

function syncScheduledMatchRoom(room, store, now = new Date()) {
  if (!room || room.startMode !== 'scheduled' || room.linkedMatchId) {
    return room;
  }

  if (room.participants.length < room.minParticipants) {
    return room;
  }

  const slotStartAtMs = new Date(room.slotStartAt).getTime();

  if (!Number.isFinite(slotStartAtMs)) {
    return room;
  }

  if (now.getTime() < slotStartAtMs - MATCH_ROOM_HOST_START_DELAY_SECONDS * 1000) {
    return room;
  }

  const session = createMatchSession(
    store,
    room.mode,
    room.distanceKm,
    room.slotStartAt,
    room.participants.map((participant, index) => ({
      id: participant.userId,
      seedRank: index + 1,
    })),
  );

  room.linkedMatchId = session.id;
  return room;
}

function syncMatchRooms(store, now = new Date()) {
  const rooms = pruneMatchRooms(store, now);
  return rooms
    .map((room) => syncScheduledMatchRoom(room, store, now))
    .map((room) => syncHostStartedMatchRoomCountdown(room, store, now));
}

function findRunningMatchRoomById(store, roomId, now = new Date()) {
  return syncMatchRooms(store, now).find((room) => room.id === roomId) ?? null;
}

function findRunningMatchRoomByInviteToken(store, inviteToken, now = new Date()) {
  const normalizedToken = String(inviteToken ?? '').trim().toUpperCase();

  if (!normalizedToken) {
    return null;
  }

  return syncMatchRooms(store, now).find((room) => String(room.inviteToken).toUpperCase() === normalizedToken) ?? null;
}

export function findRunningMatchRoomForUser(store, userId, now = new Date()) {
  const rooms = syncMatchRooms(store, now)
    .filter((room) => isMatchRoomVisibleToUser(room, userId))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  return rooms[0] ?? null;
}

export function findRunningMatchRoomInviteInboxForUser(store, currentUser, now = new Date()) {
  const identityAliases = new Set([
    currentUser?.id,
    currentUser?.publicTag,
  ].map((value) => String(value ?? '').trim()).filter(Boolean));
  const rooms = syncMatchRooms(store, now)
    .filter((room) => (
      !room.participants.some((participant) => identityAliases.has(participant.userId))
      && Array.isArray(room.invitedFriendIds)
      && room.invitedFriendIds.some((invitedUserId) => identityAliases.has(String(invitedUserId ?? '').trim()))
    ))
    .sort((left, right) => new Date(right.updatedAt ?? right.createdAt).getTime() - new Date(left.updatedAt ?? left.createdAt).getTime());

  return rooms[0] ?? null;
}

function buildRunningMatchRoomParticipantPayload(store, participant, linkedParticipantFieldsByUserId = null) {
  const user = findUserById(store, participant.userId);
  const runner = buildMatchRunnerProfile(store, user);
  const linkedParticipantFields = linkedParticipantFieldsByUserId?.get(participant.userId) ?? null;

  return {
    userId: runner.id,
    name: runner.name,
    tag: runner.tag,
    districtName: runner.districtName,
    averagePace: runner.averagePace,
    levelLabel: runner.levelLabel,
    ...(linkedParticipantFields ?? {}),
    isHost: Boolean(participant.isHost),
    isReady: Boolean(participant.isReady),
    isCountdownReady: Boolean(participant.isCountdownReady),
    invited: Boolean(participant.invited),
    joinedAt: participant.joinedAt,
  };
}

function buildRunningMatchRoomInviteePayload(store, room, userId, invitedAt) {
  const user = findUserById(store, userId);
  const runner = buildMatchRunnerProfile(store, user);

  return {
    inviteId: `${room.id}:${runner.id}`,
    roomId: room.id,
    inviteToken: room.inviteToken,
    invitedUserId: runner.id,
    userId: runner.id,
    name: runner.name,
    tag: runner.tag,
    districtName: runner.districtName,
    averagePace: runner.averagePace,
    levelLabel: runner.levelLabel,
    status: 'pending',
    ...(invitedAt ? { invitedAt } : {}),
  };
}

function armRunningMatchRoomCountdown(store, room, now = new Date()) {
  if (!room?.linkedMatchId) {
    return room;
  }

  const linkedSession = findMatchSessionById(store, room.linkedMatchId);
  if (!linkedSession) {
    return room;
  }

  const slotStartAt = linkedSession.slotStartAt ?? room.slotStartAt;
  room.slotStartAt = slotStartAt;
  room.countdownArmedAt = now.toISOString();
  linkedSession.slotStartAt = slotStartAt;
  delete linkedSession.startedAt;
  return room;
}

function syncHostStartedMatchRoomCountdown(room, store, now = new Date()) {
  if (!room || room.startMode !== 'host' || !room.linkedMatchId) {
    return room;
  }

  const linkedSession = getMatchRoomLinkedSession(room, store);
  if (!linkedSession || room.countdownArmedAt) {
    return room;
  }

  const slotStartAtMs = new Date(linkedSession.slotStartAt ?? room.slotStartAt).getTime();
  const loadingWindowEnded = Number.isFinite(slotStartAtMs)
    && now.getTime() >= slotStartAtMs - MATCH_ROOM_HOST_START_DELAY_SECONDS * 1000;

  if (loadingWindowEnded) {
    return armRunningMatchRoomCountdown(store, room, now);
  }

  return room;
}

export function buildRunningMatchRoomResponse(store, currentUser, room, now = new Date()) {
  if (!room) {
    return {
      success: true,
      serverNow: now.toISOString(),
      room: null,
    };
  }

  const hostUser = findUserById(store, room.hostUserId);
  const linkedSession = getMatchRoomLinkedSession(room, store);
  const linkedMatchState = linkedSession ? hydrateMatchSessionState(linkedSession, now) : null;
  const linkedOfficialByUserId = linkedSession
    ? new Map(buildOfficialSessionStandings(store, linkedSession, now).map((standing) => [standing.userId, standing]))
    : null;
  const linkedParticipantFieldsByUserId = linkedSession
    ? new Map(linkedSession.participants.map((participant) => [
        participant.userId,
        {
          ...buildParticipantLiveSnapshot(linkedSession, participant, now),
          ...buildOfficialStandingFields(linkedOfficialByUserId?.get(participant.userId)),
        },
      ]))
    : null;
  const roomState = getRunningMatchRoomState(room, store, now);
  const hasJoined = room.participants.some((participant) => participant.userId === currentUser.id);
  const joinedUserIds = new Set(room.participants.map((participant) => participant.userId));
  const pendingInvitedFriendIds = room.invitedFriendIds.filter((userId) => !joinedUserIds.has(userId));
  const linkedCurrentParticipant = linkedSession?.participants?.find((participant) => participant.userId === currentUser.id);

  if (linkedCurrentParticipant && isParticipantDoneWithMatch(linkedCurrentParticipant, now)) {
    return {
      success: true,
      serverNow: now.toISOString(),
      room: null,
    };
  }

  return {
    success: true,
    serverNow: now.toISOString(),
    room: {
      roomId: room.id,
      inviteToken: room.inviteToken,
      inviteLink: buildMatchRoomInviteLink(room.inviteToken),
      mode: room.mode,
      state: roomState,
      startMode: room.startMode,
      distanceKm: room.distanceKm,
      slotStartAt: room.slotStartAt,
      slotLabel: room.startMode === 'host' && !linkedSession
        ? '방장 시작'
        : formatDuelSlotLabelFromDateTime(room.slotStartAt),
      maxParticipants: room.maxParticipants,
      minParticipants: room.minParticipants,
      canStart: room.startMode === 'host'
        && room.hostUserId === currentUser.id
        && !linkedSession
        && room.participants.length >= room.minParticipants
        && areAllRunningMatchRoomGuestsReady(room),
      isHost: room.hostUserId === currentUser.id,
      hostUserId: room.hostUserId,
      hostName: hostUser.name,
      participants: room.participants
        .map((participant) => buildRunningMatchRoomParticipantPayload(store, participant, linkedParticipantFieldsByUserId))
        .sort((left, right) => {
          if (left.isHost !== right.isHost) {
            return left.isHost ? -1 : 1;
          }

          return new Date(left.joinedAt).getTime() - new Date(right.joinedAt).getTime();
        }),
      invitedFriendIds: room.invitedFriendIds,
      invitedFriends: pendingInvitedFriendIds.map((userId) => buildRunningMatchRoomInviteePayload(store, room, userId, room.updatedAt ?? room.createdAt)),
      countdownReadyCount: room.participants.filter((participant) => participant.isCountdownReady).length,
      countdownReadyRequiredCount: room.participants.length,
      ...(linkedSession ? {
        linkedMatchId: linkedSession.id,
        linkedMatchStatus: linkedMatchState === 'active' ? 'active' : 'matched',
        linkedMatchSlotStartAt: linkedSession.slotStartAt,
        linkedMatchDistanceKm: linkedSession.distanceKm,
      } : {}),
      joined: hasJoined,
    },
  };
}

function buildMatchRoomLockMessage(room, store, currentUserId) {
  const modeLabel = room.mode === 'duel' ? '1대1 방' : '그룹 방';
  const roomState = getRunningMatchRoomState(room, store);

  if (roomState === 'active') {
    return `이미 진행 중인 ${modeLabel}이 있어요. 현재 대결을 먼저 끝내야 새 매칭을 신청할 수 있어요.`;
  }

  if (room.startMode === 'host' && !room.linkedMatchId) {
    return `이미 참여 중인 ${modeLabel}이 있어요. 그 방을 먼저 나와야 다른 매칭을 신청할 수 있어요.`;
  }

  return `이미 예약된 ${modeLabel}이 있어요. 기존 방을 먼저 정리해야 다른 매칭을 신청할 수 있어요.`;
}

function getLiveRunShareEntryForUser(store, userId) {
  if (Array.isArray(store.liveRunShares)) {
    return store.liveRunShares.find((entry) => entry?.userId === userId) ?? null;
  }

  if (store.liveRunShares && typeof store.liveRunShares === 'object') {
    return store.liveRunShares[userId] ?? null;
  }

  return null;
}

function buildRunningMatchRequestBlocker(store, currentUser, now = new Date()) {
  const existingSession = findAnyReservedMatchSessionForUser(store, currentUser.id, now);

  if (existingSession) {
    return {
      legacyBlocker: 'matchSession',
      source: 'matchSessions.activeParticipant',
      message: buildSingleMatchLockMessage(existingSession.session.mode, existingSession.session.slotStartAt, existingSession.state),
      details: {
        source: 'matchSessions.activeParticipant',
        sessionId: existingSession.session.id,
        mode: existingSession.session.mode,
        state: existingSession.state,
        slotStartAt: existingSession.session.slotStartAt,
      },
    };
  }

  const existingQueue = findAnyQueuedMatchEntryForUser(store, currentUser.id);

  if (existingQueue) {
    return {
      legacyBlocker: 'matchQueue',
      source: `matchQueues.${existingQueue.mode}`,
      message: buildSingleMatchLockMessage(existingQueue.mode, existingQueue.entry.slotStartAt, 'waiting'),
      details: {
        source: `matchQueues.${existingQueue.mode}`,
        queueId: existingQueue.entry.id,
        mode: existingQueue.mode,
        state: 'waiting',
        slotStartAt: existingQueue.entry.slotStartAt,
      },
    };
  }

  const existingRoom = findRunningMatchRoomForUser(store, currentUser.id, now);

  if (existingRoom) {
    const participant = existingRoom.participants.find((entry) => entry.userId === currentUser.id) ?? null;
    const isInvited = Array.isArray(existingRoom.invitedFriendIds) && existingRoom.invitedFriendIds.includes(currentUser.id);
    const roomState = getRunningMatchRoomState(existingRoom, store, now);
    const source = participant ? 'matchRooms.participant' : 'matchRooms.invited';

    return {
      legacyBlocker: 'activeRoom',
      source,
      message: buildMatchRoomLockMessage(existingRoom, store, currentUser.id),
      room: existingRoom,
      details: {
        source,
        roomId: existingRoom.id,
        mode: existingRoom.mode,
        state: roomState,
        startMode: existingRoom.startMode,
        slotStartAt: existingRoom.slotStartAt,
        linkedMatchId: existingRoom.linkedMatchId ?? null,
        isHost: existingRoom.hostUserId === currentUser.id,
        isParticipant: Boolean(participant),
        isInvited,
      },
    };
  }

  const liveRunShare = getLiveRunShareEntryForUser(store, currentUser.id);

  if (liveRunShare && !shouldClearLiveRunShareEntry(liveRunShare, now)) {
    return {
      legacyBlocker: 'liveRunShare',
      source: 'liveRunShares.active',
      message: buildLiveRunShareLockMessage(),
      details: {
        source: 'liveRunShares.active',
        state: String(liveRunShare.status ?? 'running'),
        updatedAt: liveRunShare.updatedAt ?? liveRunShare.lastUpdatedAt ?? liveRunShare.createdAt ?? null,
      },
    };
  }

  return null;
}

function logRunningMatchRequestBlocker(label, currentUser, blocker) {
  if (!blocker) {
    return;
  }

  logBackendInfo(label, {
    userId: currentUser.id,
    blocker: blocker.legacyBlocker,
    blockerSource: blocker.source,
    blockerDetails: blocker.details,
  });
}

function buildRunningMatchBlockerApiDetails(blocker) {
  return {
    blocker: blocker.legacyBlocker,
    blockerSource: blocker.source,
    blockerDetails: blocker.details ?? null,
    code: blocker.legacyBlocker === 'activeRoom' ? 'active_room_blocked' : 'stale_room_blocked',
  };
}

export function createRunningMatchRoom(store, currentUser, {
  mode,
  distanceKm,
  startMode,
  slotStartAt,
  maxParticipants,
  invitedFriendIds = [],
}) {
  assertUserCanRequestAnotherMatch(store, currentUser);

  const normalizedInvitedFriendIds = [...new Set(invitedFriendIds
    .filter((userId) => typeof userId === 'string')
    .map((userId) => userId.trim())
    .filter((userId) => userId && userId !== currentUser.id))];

  for (const friendId of normalizedInvitedFriendIds) {
    if (!areFriends(store, currentUser.id, friendId)) {
      throw new ApiError(400, '친구 목록에 있는 러너만 방에 초대할 수 있어.');
    }
  }

  const normalizedStartMode = startMode === 'host' ? 'host' : 'scheduled';
  const normalizedSlotStartAt = normalizedStartMode === 'host'
    ? new Date().toISOString()
    : validateMatchSlotInput(slotStartAt);
  const room = {
    id: nextId(`${mode}-room`),
    inviteToken: createMatchRoomInviteToken(store),
    hostUserId: currentUser.id,
    mode,
    startMode: normalizedStartMode,
    distanceKm: normalizeMatchQueueDistance(distanceKm),
    slotStartAt: normalizedSlotStartAt,
    maxParticipants: normalizeMatchRoomMaxParticipants(mode, maxParticipants),
    minParticipants: getMatchRoomMinParticipants(mode),
    invitedFriendIds: normalizedInvitedFriendIds,
    participants: [{
      userId: currentUser.id,
      isHost: true,
      isReady: false,
      isCountdownReady: false,
      invited: false,
      joinedAt: new Date().toISOString(),
    }],
    createdAt: new Date().toISOString(),
    linkedMatchId: null,
  };

  ensureMatchRooms(store).push(room);
  syncMatchRooms(store);
  return buildRunningMatchRoomResponse(store, currentUser, room);
}

function requireJoinedRunningMatchRoomResponse(payload) {
  if (payload?.room?.roomId) {
    return payload;
  }

  throw new ApiError(
    404,
    '방 정보를 불러오지 못했습니다. 다시 시도해주세요.',
    { code: 'invalid_room_response' },
  );
}

export function joinRunningMatchRoom(store, currentUser, { inviteToken }) {
  const room = findRunningMatchRoomByInviteToken(store, inviteToken);

  if (!room) {
    throw new ApiError(404, '참여할 방을 찾지 못했어. 초대 코드가 잘못됐거나 방이 삭제됐을 수 있어.', {
      code: 'room_not_found',
    });
  }

  if (room.participants.some((participant) => participant.userId === currentUser.id)) {
    return requireJoinedRunningMatchRoomResponse(buildRunningMatchRoomResponse(store, currentUser, room));
  }

  const initialBlocker = buildRunningMatchRequestBlocker(store, currentUser);
  const initialBlockerRoomId = initialBlocker?.details?.roomId;
  const blocksDifferentRoom = initialBlocker && (
    initialBlocker.legacyBlocker !== 'activeRoom' || !initialBlockerRoomId || initialBlockerRoomId !== room.id
  );

  if (blocksDifferentRoom) {
    const cleanup = cleanupStaleRunningMatchRoomState(store, currentUser);
    const blockerRoomId = cleanup.blockerDetails?.roomId;
    const stillBlocksDifferentRoom = cleanup.blocker && (
      cleanup.blocker !== 'activeRoom' || !blockerRoomId || blockerRoomId !== room.id
    );

    if (!stillBlocksDifferentRoom) {
      return joinRunningMatchRoom(store, currentUser, { inviteToken });
    }

    const blocker = {
      legacyBlocker: cleanup.blocker,
      source: cleanup.blockerSource ?? cleanup.blocker,
      details: cleanup.blockerDetails ?? null,
    };
    logRunningMatchRequestBlocker('running_match_join_blocked', currentUser, blocker);
    throw new ApiError(400, cleanup.message ?? '이미 진행 중인 매칭 상태가 있어요.', buildRunningMatchBlockerApiDetails(blocker));
  }

  if (room.linkedMatchId) {
    throw new ApiError(400, '이미 시작 준비에 들어간 방이라 지금은 참여할 수 없어.');
  }

  if (room.participants.length >= room.maxParticipants) {
    throw new ApiError(400, '이 방은 이미 정원이 다 찼어.');
  }

  room.participants.push({
    userId: currentUser.id,
    isHost: false,
    isReady: false,
    isCountdownReady: false,
    invited: room.invitedFriendIds.includes(currentUser.id),
    joinedAt: new Date().toISOString(),
  });

  syncMatchRooms(store);
  return requireJoinedRunningMatchRoomResponse(buildRunningMatchRoomResponse(store, currentUser, room));
}

export function startRunningMatchRoom(store, currentUser, { roomId }) {
  const room = findRunningMatchRoomById(store, roomId);

  if (!room) {
    throw new ApiError(404, '시작할 방을 찾지 못했어.', { code: 'room_not_found' });
  }

  if (room.hostUserId !== currentUser.id) {
    throw new ApiError(403, '방장만 시작할 수 있어.');
  }

  if (room.startMode !== 'host') {
    throw new ApiError(400, '예약 시작 방은 시간에 맞춰 자동으로 시작돼.');
  }

  if (room.linkedMatchId) {
    return buildRunningMatchRoomResponse(store, currentUser, room);
  }

  if (room.participants.length < room.minParticipants) {
    throw new ApiError(400, `최소 ${room.minParticipants}명은 모여야 시작할 수 있어.`);
  }

  if (!areAllRunningMatchRoomGuestsReady(room)) {
    throw new ApiError(400, '모든 참가자가 준비 완료해야 시작할 수 있어.');
  }

  const slotStartAt = new Date(Date.now() + (MATCH_ROOM_HOST_LOADING_SECONDS + MATCH_ROOM_HOST_START_DELAY_SECONDS) * 1000).toISOString();
  room.slotStartAt = slotStartAt;
  room.participants = room.participants.map((participant) => ({
    ...participant,
    isCountdownReady: participant.userId === currentUser.id,
  }));
  const session = createMatchSession(
    store,
    room.mode,
    room.distanceKm,
    slotStartAt,
    room.participants.map((participant, index) => ({
      id: participant.userId,
      seedRank: index + 1,
    })),
  );
  room.linkedMatchId = session.id;

  return buildRunningMatchRoomResponse(store, currentUser, room);
}

export function updateRunningMatchRoomReady(store, currentUser, {
  roomId,
  ready,
}) {
  const room = findRunningMatchRoomById(store, roomId);

  if (!room) {
    throw new ApiError(404, '준비 상태를 바꿀 방을 찾지 못했어.', { code: 'room_not_found' });
  }

  if (room.linkedMatchId) {
    throw new ApiError(400, '이미 시작 준비에 들어간 방은 준비 상태를 바꿀 수 없어.');
  }

  const participant = room.participants.find((entry) => entry.userId === currentUser.id);

  if (!participant) {
    throw new ApiError(404, '이 방 참가자 목록에서 사용자를 찾지 못했어.');
  }

  if (participant.isHost) {
    throw new ApiError(400, '방장은 준비 버튼 대신 시작 버튼을 사용해줘.');
  }

  participant.isReady = Boolean(ready);
  syncMatchRooms(store);
  return buildRunningMatchRoomResponse(store, currentUser, room);
}

export function acknowledgeRunningMatchRoomCountdown(store, currentUser, { roomId }) {
  const room = findRunningMatchRoomById(store, roomId);

  if (!room) {
    throw new ApiError(404, '카운트다운 준비 상태를 반영할 방을 찾지 못했어.', { code: 'room_not_found' });
  }

  if (!room.linkedMatchId) {
    throw new ApiError(400, '아직 시작 준비가 시작되지 않은 방이에요.');
  }

  const participant = room.participants.find((entry) => entry.userId === currentUser.id);

  if (!participant) {
    throw new ApiError(404, '이 방 참가자 목록에서 사용자를 찾지 못했어.');
  }

  participant.isCountdownReady = true;
  syncMatchRooms(store);
  return buildRunningMatchRoomResponse(store, currentUser, room);
}

export function updateRunningMatchRoom(store, currentUser, {
  roomId,
  distanceKm,
  startMode,
  slotStartAt,
  maxParticipants,
  invitedFriendIds = [],
}) {
  const room = findRunningMatchRoomById(store, roomId);

  if (!room) {
    throw new ApiError(404, '설정할 방을 찾지 못했어.', { code: 'room_not_found' });
  }

  if (room.hostUserId !== currentUser.id) {
    throw new ApiError(403, '방장만 방 설정을 바꿀 수 있어.');
  }

  if (room.linkedMatchId) {
    throw new ApiError(400, '이미 시작 준비에 들어간 방은 설정을 바꿀 수 없어.');
  }

  const normalizedInvitedFriendIds = [...new Set(invitedFriendIds
    .filter((userId) => typeof userId === 'string')
    .map((userId) => userId.trim())
    .filter((userId) => userId && userId !== currentUser.id))];

  for (const friendId of normalizedInvitedFriendIds) {
    if (!areFriends(store, currentUser.id, friendId)) {
      throw new ApiError(400, '친구 목록에 있는 러너만 방에 초대할 수 있어.');
    }
  }

  room.distanceKm = normalizeMatchQueueDistance(distanceKm);
  room.startMode = startMode === 'host' ? 'host' : 'scheduled';
  room.slotStartAt = room.startMode === 'host'
    ? new Date().toISOString()
    : validateMatchSlotInput(slotStartAt);
  room.maxParticipants = normalizeMatchRoomMaxParticipants(room.mode, maxParticipants);
  room.invitedFriendIds = normalizedInvitedFriendIds;
  room.updatedAt = new Date().toISOString();
  syncMatchRooms(store);

  return buildRunningMatchRoomResponse(store, currentUser, room);
}

export function leaveRunningMatchRoom(store, currentUser, { roomId }) {
  const room = findRunningMatchRoomById(store, roomId);

  if (!room) {
    return { success: true, room: null };
  }

  if (room.linkedMatchId) {
    throw new ApiError(400, '이미 대결 세션이 만들어진 방은 대결 화면에서 정리해줘.');
  }

  const participantIndex = room.participants.findIndex((participant) => participant.userId === currentUser.id);
  const wasInvitedOnly = room.invitedFriendIds.includes(currentUser.id) && participantIndex === -1;

  if (participantIndex === -1 && !wasInvitedOnly) {
    return buildRunningMatchRoomResponse(store, currentUser, room);
  }

  room.invitedFriendIds = room.invitedFriendIds.filter((userId) => userId !== currentUser.id);

  if (participantIndex !== -1) {
    const wasHost = room.participants[participantIndex].isHost;
    room.participants.splice(participantIndex, 1);

    if (!room.participants.length) {
      store.matchRooms = ensureMatchRooms(store).filter((entry) => entry.id !== room.id);
      return { success: true, room: null };
    }

    if (wasHost) {
      room.hostUserId = room.participants[0].userId;
      room.participants = room.participants.map((participant, index) => ({
        ...participant,
        isHost: index === 0,
      }));
    }
  }

  return buildRunningMatchRoomResponse(store, currentUser, room);
}

function countUserRoomRefs(store, userId) {
  return ensureMatchRooms(store).filter((room) => isMatchRoomVisibleToUser(room, userId)).length;
}

function countUserSessionRefs(store, userId) {
  return ensureMatchSessions(store).filter((session) => (
    Array.isArray(session.participants)
    && session.participants.some((participant) => participant.userId === userId)
  )).length;
}

function clearUserStaleReferenceFields(store, currentUser) {
  const cleanedItems = [];
  const now = new Date();
  const roomIdFields = [
    'activeRoomId',
    'activeMatchRoomId',
    'activeRunningMatchRoomId',
    'currentRoomId',
    'currentMatchRoomId',
    'partyRunRoomId',
  ];
  const matchIdFields = [
    'activeMatchId',
    'activeSessionId',
    'runningMatchId',
    'currentMatchId',
    'activeDuelMatchId',
    'activeGroupMatchId',
  ];

  for (const field of roomIdFields) {
    const value = currentUser[field];
    const hasCurrentUserRoomReference = ensureMatchRooms(store).some((room) => (
      room.id === value && isMatchRoomVisibleToUser(room, currentUser.id)
    ));

    if (typeof value === 'string' && value && !hasCurrentUserRoomReference) {
      delete currentUser[field];
      cleanedItems.push(`user.${field}`);
    }
  }

  for (const field of matchIdFields) {
    const value = currentUser[field];
    const hasCurrentUserSessionReference = ensureMatchSessions(store).some((session) => (
      session.id === value
      && ['matched', 'active'].includes(hydrateMatchSessionState(session, now))
      && session.participants.some((participant) => (
        participant.userId === currentUser.id && !isParticipantDoneWithMatch(participant, now)
      ))
    ));

    if (typeof value === 'string' && value && !hasCurrentUserSessionReference) {
      delete currentUser[field];
      cleanedItems.push(`user.${field}`);
    }
  }

  return cleanedItems;
}

function clearUserLiveRunShare(store, userId, now = new Date()) {
  if (Array.isArray(store.liveRunShares)) {
    const beforeCount = store.liveRunShares.length;
    store.liveRunShares = store.liveRunShares.filter((entry) => (
      entry?.userId !== userId || !shouldClearLiveRunShareEntry(entry, now)
    ));
    return store.liveRunShares.length !== beforeCount;
  }

  if (store.liveRunShares && typeof store.liveRunShares === 'object') {
    const entry = store.liveRunShares[userId];
    if (Object.prototype.hasOwnProperty.call(store.liveRunShares, userId) && shouldClearLiveRunShareEntry(entry, now)) {
      delete store.liveRunShares[userId];
      return true;
    }
  }

  return false;
}

function detachUserFromStaleMatchRoom(store, room, userId) {
  const rooms = ensureMatchRooms(store);
  const roomIndex = rooms.findIndex((entry) => entry.id === room.id);

  if (roomIndex === -1) {
    return false;
  }

  const nextParticipants = room.participants.filter((participant) => participant.userId !== userId);
  const beforeInviteCount = Array.isArray(room.invitedFriendIds) ? room.invitedFriendIds.length : 0;
  room.invitedFriendIds = Array.isArray(room.invitedFriendIds)
    ? room.invitedFriendIds.filter((invitedUserId) => invitedUserId !== userId)
    : [];
  const removedParticipant = nextParticipants.length !== room.participants.length;
  const removedInvite = room.invitedFriendIds.length !== beforeInviteCount;

  if (!removedParticipant && !removedInvite) {
    return false;
  }

  if (nextParticipants.length === 0) {
    store.matchRooms = rooms.filter((entry) => entry.id !== room.id);
    return true;
  }

  const removedHost = room.hostUserId === userId || room.participants.some((participant) => participant.userId === userId && participant.isHost);
  room.participants = nextParticipants;

  if (removedHost) {
    room.hostUserId = room.participants[0].userId;
    room.participants = room.participants.map((participant, index) => ({
      ...participant,
      isHost: index === 0,
    }));
  }

  room.updatedAt = new Date().toISOString();
  return true;
}

export function cleanupStaleRunningMatchRoomState(store, currentUser, now = new Date()) {
  const cleanedItems = [];
  const beforeRoomRefs = countUserRoomRefs(store, currentUser.id);
  const beforeSessionRefs = countUserSessionRefs(store, currentUser.id);
  const beforeQueueRefs = countUserQueueRefs(store, currentUser.id);

  pruneMatchQueues(store, now);
  pruneMatchSessions(store, now);
  pruneMatchRooms(store, now);

  const afterPruneRoomRefs = countUserRoomRefs(store, currentUser.id);
  const afterPruneSessionRefs = countUserSessionRefs(store, currentUser.id);
  const afterPruneQueueRefs = countUserQueueRefs(store, currentUser.id);

  if (afterPruneRoomRefs < beforeRoomRefs) {
    cleanedItems.push('matchRooms.pruned');
  }

  if (afterPruneSessionRefs < beforeSessionRefs) {
    cleanedItems.push('matchSessions.pruned');
  }

  if (afterPruneQueueRefs < beforeQueueRefs) {
    cleanedItems.push('matchQueues.pruned');
  }

  cleanedItems.push(...clearUserStaleReferenceFields(store, currentUser));

  const existingRoom = findRunningMatchRoomForUser(store, currentUser.id, now);

  if (existingRoom) {
    const linkedSession = getMatchRoomLinkedSession(existingRoom, store);
    const linkedParticipant = linkedSession?.participants?.find((participant) => participant.userId === currentUser.id) ?? null;
    const roomPayload = buildRunningMatchRoomResponse(store, currentUser, existingRoom, now);
    const shouldDetachStaleRoomParticipant = Boolean(
      !roomPayload.room
      || (linkedParticipant && isParticipantDoneWithMatch(linkedParticipant, now))
      || (existingRoom.linkedMatchId && !linkedSession),
    );

    if (!shouldDetachStaleRoomParticipant) {
      const blocker = buildRunningMatchRequestBlocker(store, currentUser, now);
      logRunningMatchRequestBlocker('running_match_cleanup_blocked', currentUser, blocker);
      return {
        success: true,
        serverNow: now.toISOString(),
        code: 'active_room_blocked',
        cleaned: cleanedItems.length > 0,
        cleanedItems,
        blocker: blocker?.legacyBlocker ?? 'activeRoom',
        blockerSource: blocker?.source ?? 'matchRooms.participant',
        blockerDetails: blocker?.details ?? {
          source: 'matchRooms.participant',
          roomId: existingRoom.id,
          mode: existingRoom.mode,
          state: getRunningMatchRoomState(existingRoom, store, now),
        },
        message: blocker?.message ?? buildMatchRoomLockMessage(existingRoom, store, currentUser.id),
        room: roomPayload.room,
      };
    }

    if (detachUserFromStaleMatchRoom(store, existingRoom, currentUser.id)) {
      cleanedItems.push('matchRooms.detachedDoneParticipant');
    }

    pruneMatchRooms(store, now);
  }

  if (clearUserLiveRunShare(store, currentUser.id, now)) {
    cleanedItems.push('liveRunShares.currentUser');
  }

  const blocker = buildRunningMatchRequestBlocker(store, currentUser, now);

  if (blocker) {
    logRunningMatchRequestBlocker('running_match_cleanup_blocked', currentUser, blocker);
    return {
      success: true,
      serverNow: now.toISOString(),
      code: blocker.legacyBlocker === 'activeRoom' ? 'active_room_blocked' : 'stale_room_blocked',
      cleaned: cleanedItems.length > 0,
      cleanedItems,
      blocker: blocker.legacyBlocker,
      blockerSource: blocker.source,
      blockerDetails: blocker.details,
      message: blocker.message,
      room: blocker.room ? buildRunningMatchRoomResponse(store, currentUser, blocker.room, now).room : null,
    };
  }

  const nextRoom = findRunningMatchRoomForUser(store, currentUser.id, now);

  return {
    success: true,
    serverNow: now.toISOString(),
    cleaned: cleanedItems.length > 0,
    cleanedItems,
    room: nextRoom ? buildRunningMatchRoomResponse(store, currentUser, nextRoom, now).room : null,
  };
}

function buildSyntheticParticipantLiveSnapshot(session, participant, now = new Date()) {
  if (!participant?.profileSnapshot || hydrateMatchSessionState(session, now) !== 'active') {
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

function buildParticipantLiveSnapshot(session, participant, now = new Date()) {
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

function buildOfficialSessionStandings(store, session, now = new Date()) {
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

    return {
      userId: participant.userId,
      name: runner.name,
      seedRank: participant.seedRank,
      liveDistanceKm,
      liveElapsedSeconds,
      liveStatus,
      hasProgress,
      officialAveragePace: buildProgressAveragePaceLabel(liveDistanceKm, liveElapsedSeconds),
    };
  });

  const readySnapshots = snapshots.filter((snapshot) => snapshot.hasProgress);
  const officialElapsedSeconds = readySnapshots.length >= 2
    ? Math.max(0, Math.min(...readySnapshots.map((snapshot) => snapshot.liveElapsedSeconds)))
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
    return {
      ...snapshot,
      officialRank: index + 1,
      officialGapLeaderKm: Number(Math.max(0, leaderDistanceKm - snapshot.officialDistanceKm).toFixed(2)),
      officialGapAheadKm: aheadRunner
        ? Number(Math.max(0, aheadRunner.officialDistanceKm - snapshot.officialDistanceKm).toFixed(2))
        : null,
    };
  });
}

function findMatchSessionForUser(store, mode, userId, { distanceKm, slotStartAt, testMode = false, matchId } = {}) {
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

  return { success: true };
}

function findMatchSessionById(store, matchId) {
  if (!matchId) {
    return null;
  }

  return pruneMatchSessions(store).find((session) => session.id === matchId) ?? null;
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

function findAnyReservedMatchSessionForUser(store, userId, now = new Date()) {
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

function assertUserCanRequestAnotherMatch(store, currentUser) {
  const now = new Date();
  const cleanup = cleanupStaleRunningMatchRoomState(store, currentUser, now);

  if (cleanup.blocker) {
    logRunningMatchRequestBlocker('running_match_request_blocked', currentUser, {
      legacyBlocker: cleanup.blocker,
      source: cleanup.blockerSource ?? cleanup.blocker,
      details: cleanup.blockerDetails ?? null,
    });
    throw new ApiError(400, cleanup.message ?? '이미 진행 중인 매칭 상태가 있어요.', buildRunningMatchBlockerApiDetails({
      legacyBlocker: cleanup.blocker,
      source: cleanup.blockerSource ?? cleanup.blocker,
      details: cleanup.blockerDetails ?? null,
    }));
  }
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

  currentParticipant.liveDistanceKm = normalizedProgress.distanceKm;
  currentParticipant.liveElapsedSeconds = normalizedProgress.elapsedSeconds;
  currentParticipant.livePace = currentPace;
  currentParticipant.liveUpdatedAt = new Date().toISOString();
  currentParticipant.liveStatus = status === 'finished' ? 'finished' : status;
  if (!session.startedAt) {
    session.startedAt = currentParticipant.liveUpdatedAt;
  }

  if (status === 'finished') {
    currentParticipant.finishedAt = currentParticipant.liveUpdatedAt;
  }

  if (status === 'running') {
    currentParticipant.finishedAt = null;
  }

  if (status === 'background' || status === 'paused') {
    currentParticipant.finishedAt = null;
  }

  return buildRunningMatchStatusResponse(store, currentUser, {
    mode: session.mode,
    distanceKm: session.distanceKm,
    slotStartAt: session.slotStartAt,
  });
}
