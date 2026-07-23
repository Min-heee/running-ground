import assert from 'node:assert/strict';

import { buildAdminLiveActivity } from './adminLiveActivity.mjs';

function runTest(name, testFn) {
  try {
    testFn();
    console.log(`[adminLiveActivity] ok - ${name}`);
  } catch (error) {
    console.error(`[adminLiveActivity] failed - ${name}`);
    throw error;
  }
}

const NOW = new Date('2026-07-23T12:00:00.000Z');

const store = {
  users: [
    { id: 'u1', name: '회원G', publicTag: '#AAAAA' },
    { id: 'u2', name: '회원D', publicTag: '#BBBBB' },
  ],
  matchSessions: [{
    id: 'duel-match-1',
    mode: 'duel',
    isPartyRun: true,
    distanceKm: 3,
    slotStartAt: '2026-07-23T11:55:00.000Z',
    createdAt: '2026-07-23T11:54:00.000Z',
    participants: [
      { userId: 'u1', liveStatus: 'running', liveDistanceKm: 1.2, livePace: '05:50/km', liveElapsedSeconds: 420, finishedAt: null },
      { userId: 'ghost-user', liveStatus: 'running', liveDistanceKm: 1.1, livePace: '06:05/km', liveElapsedSeconds: 420, finishedAt: '2026-07-23T11:59:00.000Z' },
    ],
  }],
  matchRooms: [
    { id: 'room-1', mode: 'group', startMode: 'host', distanceKm: 5, hostUserId: 'u2', inviteToken: 'ABC123', participants: [{ userId: 'u2' }], maxParticipants: 6, linkedMatchId: null },
    { id: 'room-2', mode: 'duel', hostUserId: 'u1', participants: [{ userId: 'u1' }], maxParticipants: 2, linkedMatchId: 'duel-match-1' },
  ],
  liveRunShares: [
    { userId: 'u1', enabled: true, status: 'running', locationLabel: '일산 호수공원', updatedAt: '2026-07-23T11:59:30.000Z' },
    { userId: 'u2', enabled: true, status: 'running', updatedAt: '2026-07-23T11:40:00.000Z' },
    { userId: 'u1', enabled: false, status: 'idle', updatedAt: '2026-07-23T11:59:00.000Z' },
  ],
};

runTest('sessions carry per-participant live metrics and resolve names', () => {
  const live = buildAdminLiveActivity(store, NOW);

  assert.equal(live.sessions.length, 1);
  const [session] = live.sessions;
  assert.equal(session.mode, 'duel');
  assert.equal(session.isPartyRun, true);
  assert.equal(session.participants[0].name, '회원G');
  assert.equal(session.participants[0].liveDistanceKm, 1.2);
  assert.equal(session.participants[1].name, '(탈퇴한 러너)');
  assert.equal(session.participants[1].finished, true);
});

runTest('rooms exclude those already linked to a session', () => {
  const live = buildAdminLiveActivity(store, NOW);

  assert.equal(live.rooms.length, 1);
  assert.equal(live.rooms[0].id, 'room-1');
  assert.equal(live.rooms[0].hostName, '회원D');
  assert.equal(live.rooms[0].participantCount, 1);
});

runTest('live runs keep enabled running shares and flag stale ones', () => {
  const live = buildAdminLiveActivity(store, NOW);

  assert.equal(live.liveRuns.length, 2);
  const fresh = live.liveRuns.find((run) => run.locationLabel === '일산 호수공원');
  const stale = live.liveRuns.find((run) => run.name === '회원D');
  assert.equal(fresh.stale, false);
  assert.equal(stale.stale, true);
  assert.equal(live.counts.liveRuns, 1);
});

runTest('an empty store produces an empty snapshot', () => {
  const live = buildAdminLiveActivity({}, NOW);

  assert.deepEqual(live.counts, { sessions: 0, rooms: 0, liveRuns: 0 });
  assert.deepEqual(live.sessions, []);
});
