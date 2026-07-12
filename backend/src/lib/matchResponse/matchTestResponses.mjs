import {
  buildLevelLabel,
  buildPaceBandLabel,
  formatPaceMinutesLabel,
} from '../matchFormatting.mjs';
import { formatDuelSlotLabel as formatDuelSlotLabelFromDateTime } from '../dateTimeFormatting.mjs';
import {
  buildTestMatchQueueExpiresAt,
  buildTestMatchStartAt,
  isTestMatchSession,
} from '../matchScheduleHelpers.mjs';
import {
  ensureMatchQueues,
  removeUsersFromMatchQueue,
  upsertMatchQueueEntry,
} from '../matchQueueStoreHelpers.mjs';
import { nextId } from '../idHelpers.mjs';
import {
  buildMatchRunnerProfile,
  createMatchSession,
  ensureMatchSessions,
  resolveSessionParticipantProfile,
} from '../runningMatchSessionStoreHelpers.mjs';
import { buildSessionGroupParticipants } from './matchResponseParticipants.mjs';

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

export function buildTestDuelMatchResponse(store, currentUser, { distanceKm }) {
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

export function buildTestGroupMatchResponse(store, currentUser, { distanceKm }) {
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

export function clearUserTestMatchArtifacts(store, userId) {
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
