import assert from 'node:assert/strict';
import test from 'node:test';

import { wipePrelaunchData } from './wipePrelaunchDataTransform.mjs';

function buildFixtureStore() {
  return {
    version: 7,
    users: [
      { id: 'user-reviewer', username: 'Reviewer01', phone: '010-9999-0000', points: 10, publicTag: 'REVIEW#1' },
      { id: 'user-tester-a', username: 'tester_a', phone: '01011112222', points: 55, publicTag: 'TESTA#1' },
      { id: 'user-tester-b', username: 'tester_b', phone: '01033334444', points: 5, publicTag: 'TESTB#1' },
    ],
    runs: [
      { id: 'run-reviewer-1', userId: 'user-reviewer', distanceMeters: 1200 },
      { id: 'run-a-1', userId: 'user-tester-a', distanceMeters: 5000 },
      { id: 'run-a-2', userId: 'user-tester-a', distanceMeters: 3000 },
      { id: 'run-b-1', userId: 'user-tester-b', distanceMeters: 800 },
    ],
    integrationImports: [
      { id: 'import-1', userId: 'user-tester-a' },
    ],
    phoneVerificationChallenges: [
      { id: 'challenge-reviewer', phone: '01099990000', purpose: 'register', status: 'verified' },
      { id: 'challenge-a', phone: '01011112222', purpose: 'register', status: 'verified' },
    ],
    matchQueues: {
      duel: [{ userId: 'user-tester-a' }],
      group: [],
    },
    matchSessions: [{ id: 'session-live-1', participants: ['user-tester-a', 'user-tester-b'] }],
    matchRooms: [{ id: 'room-1' }],
    friendRequests: [
      { id: 'request-1', requesterId: 'user-tester-a', receiverId: 'user-reviewer' },
    ],
    friendships: [
      { id: 'friendship-1', userIds: ['user-tester-a', 'user-tester-b'] },
    ],
    rewardRedemptions: [
      { id: 'redemption-1', userId: 'user-tester-b' },
    ],
    notifications: [
      { id: 'notification-reviewer', userId: 'user-reviewer' },
      { id: 'notification-a', userId: 'user-tester-a' },
    ],
    sessions: [
      { token: 'token-reviewer', userId: 'user-reviewer' },
      { token: 'token-a', userId: 'user-tester-a' },
    ],
    liveRunShares: [
      { userId: 'user-reviewer', enabled: true, status: 'idle' },
      { userId: 'user-tester-a', enabled: true, status: 'running' },
    ],
    marketCatalog: [{ id: 'reward-1' }],
    notices: [{ id: 'notice-1' }],
    offlineRaceEvents: [
      { id: 'race-1', registeredUserTags: ['REVIEW#1', 'TESTA#1', 'TESTB#1'] },
    ],
    offlineRaceGuideSteps: [{ id: 'guide-1' }],
    regionTree: { seoul: {} },
  };
}

test('keeps only reviewer01 (case-insensitive) and everything attached to them', () => {
  const store = buildFixtureStore();
  const summary = wipePrelaunchData(store, { keepUsernames: ['reviewer01'] });

  assert.deepEqual(store.users.map((user) => user.id), ['user-reviewer']);
  assert.deepEqual(store.runs.map((run) => run.id), ['run-reviewer-1']);
  assert.deepEqual(store.sessions.map((entry) => entry.token), ['token-reviewer']);
  assert.deepEqual(store.notifications.map((entry) => entry.id), ['notification-reviewer']);
  assert.deepEqual(
    store.phoneVerificationChallenges.map((entry) => entry.id),
    ['challenge-reviewer'],
  );
  assert.equal(store.integrationImports.length, 0);
  assert.equal(store.rewardRedemptions.length, 0);
  assert.equal(store.friendRequests.length, 0);
  assert.equal(store.friendships.length, 0);
  assert.equal(store.matchSessions.length, 0);
  assert.equal(store.matchRooms.length, 0);
  assert.deepEqual(store.matchQueues, { duel: [], group: [] });
  assert.deepEqual(store.liveRunShares.map((entry) => entry.userId), ['user-reviewer']);
  assert.deepEqual(store.offlineRaceEvents[0].registeredUserTags, ['REVIEW#1']);

  assert.deepEqual(summary.keptUsernames, ['Reviewer01']);
  assert.deepEqual(summary.missingKeepUsernames, []);
  assert.deepEqual(summary.removedUserIds.sort(), ['user-tester-a', 'user-tester-b']);
  assert.deepEqual(summary.removedRunIds.sort(), ['run-a-1', 'run-a-2', 'run-b-1']);
  assert.equal(summary.removedCounts.users, 2);
  assert.equal(summary.removedCounts.runs, 3);
  assert.equal(summary.removedCounts.matchQueueEntries, 1);
  assert.equal(summary.removedCounts.liveRunShares, 1);
  assert.equal(summary.removedCounts.offlineRaceRegistrations, 2);
  assert.equal(summary.totalRemoved > 0, true);
});

test('never touches seed/content collections', () => {
  const store = buildFixtureStore();
  wipePrelaunchData(store, { keepUsernames: ['reviewer01'] });

  assert.equal(store.version, 7);
  assert.equal(store.marketCatalog.length, 1);
  assert.equal(store.notices.length, 1);
  assert.equal(store.offlineRaceEvents.length, 1, 'race events themselves are content and stay');
  assert.equal(store.offlineRaceGuideSteps.length, 1);
  assert.deepEqual(store.regionTree, { seoul: {} });
});

test('reports a keep username that does not exist in the store', () => {
  const store = buildFixtureStore();
  const summary = wipePrelaunchData(store, { keepUsernames: ['reviewer01', 'ghost_user'] });

  assert.deepEqual(summary.missingKeepUsernames, ['ghost_user']);
  assert.deepEqual(store.users.map((user) => user.id), ['user-reviewer']);
});

test('is idempotent — a second run removes nothing', () => {
  const store = buildFixtureStore();
  wipePrelaunchData(store, { keepUsernames: ['reviewer01'] });
  const second = wipePrelaunchData(store, { keepUsernames: ['reviewer01'] });

  assert.equal(second.totalRemoved, 0);
  assert.deepEqual(second.removedRunIds, []);
  assert.deepEqual(second.removedUserIds, []);
});

test('multiple keep accounts preserve the friendship between them', () => {
  const store = buildFixtureStore();
  store.friendships.push({ id: 'friendship-2', userIds: ['user-reviewer', 'user-tester-a'] });
  const summary = wipePrelaunchData(store, { keepUsernames: ['reviewer01', 'tester_a'] });

  assert.deepEqual(store.users.map((user) => user.id).sort(), ['user-reviewer', 'user-tester-a']);
  assert.deepEqual(store.friendships.map((entry) => entry.id), ['friendship-2']);
  assert.deepEqual(store.runs.map((run) => run.id).sort(), ['run-a-1', 'run-a-2', 'run-reviewer-1']);
  assert.deepEqual(summary.removedUserIds, ['user-tester-b']);
});

test('tolerates a store with missing collections', () => {
  const store = {
    users: [{ id: 'user-reviewer', username: 'reviewer01', phone: '01000000000' }],
  };
  const summary = wipePrelaunchData(store, { keepUsernames: ['reviewer01'] });

  assert.equal(summary.totalRemoved, 0);
  assert.deepEqual(store.runs, []);
  assert.deepEqual(store.sessions, []);
});
