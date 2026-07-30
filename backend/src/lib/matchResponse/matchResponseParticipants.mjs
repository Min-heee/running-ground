import {
  buildOfficialStandingFields,
  calculateMatchCompatibilityScore,
} from '../matchPureHelpers.mjs';
import { getMatchQueueEntries } from '../matchQueueStoreHelpers.mjs';
import { findUserById } from '../userStoreHelpers.mjs';
import {
  buildMatchRunnerProfile,
  buildOfficialSessionStandings,
  buildParticipantLiveSnapshot,
  resolveSessionParticipantProfile,
} from '../runningMatchSessionStoreHelpers.mjs';

export function buildSessionGroupParticipants(store, session, now = new Date(), officialStandings = null) {
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
        seedSummary: `${participant.seedRank}번 시드 · 이번 주 ${(runner.displayWeeklyDistanceKm ?? runner.weeklyDistanceKm).toFixed(1)}km`,
        accepted: Boolean(participant.acceptedAt),
        ...buildParticipantLiveSnapshot(session, participant, now),
        ...buildOfficialStandingFields(officialByUserId.get(participant.userId)),
      };
    })
    .sort((left, right) => (left.officialRank ?? left.seedRank) - (right.officialRank ?? right.seedRank));
}

export function buildSessionDuelOpponent(store, session, currentUserId, now = new Date(), officialStandings = null) {
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
    compatibilitySummary: `${opponentRunner.averagePace} 페이스 · ${opponentRunner.levelLabel} · 이번 주 ${(opponentRunner.displayWeeklyDistanceKm ?? opponentRunner.weeklyDistanceKm).toFixed(1)}km · 적합도 ${compatibilityScore.toFixed(0)}점`,
    accepted: Boolean(opponentEntry.acceptedAt),
    ...buildParticipantLiveSnapshot(session, opponentEntry, now),
    ...buildOfficialStandingFields(officialByUserId.get(opponentEntry.userId)),
  };
}

export function buildQueuedMatchRunnerEntries(store, mode, currentRunner, { distanceKm, slotStartAt, includeCurrentUser = false, testMode = false }) {
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
