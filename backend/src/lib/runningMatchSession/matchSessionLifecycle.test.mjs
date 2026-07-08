import assert from 'node:assert/strict';
import test from 'node:test';
import { MATCH_SESSION_ALL_DONE_RETENTION_MS } from '../matchConstants.mjs';
import { clearVanishedMatchTombstones, isMatchTombstoned } from '../vanishedMatchTombstones.mjs';
import { pruneMatchSessions } from './matchSessionLifecycle.mjs';

function isoAgo(now, ms) {
  return new Date(now.getTime() - ms).toISOString();
}

function buildParticipant(userId, overrides = {}) {
  return {
    userId,
    seedRank: 1,
    profileSnapshot: { name: userId },
    acceptedAt: null,
    liveStatus: 'running',
    liveDistanceKm: 1,
    liveElapsedSeconds: 600,
    livePace: '06:00/km',
    liveUpdatedAt: null,
    finishedAt: null,
    finishElapsedSeconds: null,
    ...overrides,
  };
}

function buildDuelSession(now, { id, participants, startedAgoMs = 30 * 60 * 1000 }) {
  return {
    id,
    mode: 'duel',
    isTestMatch: false,
    isPartyRun: false,
    distanceKm: 7,
    slotStartAt: isoAgo(now, startedAgoMs),
    startedAt: isoAgo(now, startedAgoMs),
    createdAt: isoAgo(now, startedAgoMs + 60_000),
    matchedAt: isoAgo(now, startedAgoMs + 60_000),
    participants,
  };
}

function buildStore(sessions) {
  return {
    users: [{ id: 'u1' }, { id: 'u2' }],
    matchSessions: sessions,
  };
}

test('POST-FINISH RETENTION: an all-done session survives the prune inside the window', () => {
  clearVanishedMatchTombstones();
  const now = new Date();
  const store = buildStore([
    buildDuelSession(now, {
      id: 'duel-retained',
      participants: [
        buildParticipant('u1', {
          liveStatus: 'finished',
          finishedAt: isoAgo(now, 5 * 60 * 1000),
          liveUpdatedAt: isoAgo(now, 5 * 60 * 1000),
          finishElapsedSeconds: 2400,
        }),
        buildParticipant('u2', {
          liveStatus: 'finished',
          // The slower finisher whose echo the retention protects — done 4 minutes ago.
          finishedAt: isoAgo(now, 4 * 60 * 1000),
          liveUpdatedAt: isoAgo(now, 4 * 60 * 1000),
          finishElapsedSeconds: 2430,
        }),
      ],
    }),
  ]);

  const kept = pruneMatchSessions(store, now);

  assert.equal(kept.length, 1, 'the just-finished session must be retained for the echo window');
  assert.equal(kept[0].id, 'duel-retained');
  assert.equal(isMatchTombstoned('duel-retained', now), false, 'no premature tombstone');
});

test('POST-FINISH RETENTION: the session drops (and tombstones) once the window expires', () => {
  clearVanishedMatchTombstones();
  const now = new Date();
  const doneAgoMs = MATCH_SESSION_ALL_DONE_RETENTION_MS + 60_000;
  const store = buildStore([
    buildDuelSession(now, {
      id: 'duel-expired-retention',
      participants: [
        buildParticipant('u1', {
          liveStatus: 'finished',
          finishedAt: isoAgo(now, doneAgoMs + 30_000),
          liveUpdatedAt: isoAgo(now, doneAgoMs + 30_000),
        }),
        buildParticipant('u2', {
          liveStatus: 'forfeited',
          forfeitedAt: isoAgo(now, doneAgoMs),
          liveUpdatedAt: isoAgo(now, doneAgoMs),
        }),
      ],
    }),
  ]);

  const kept = pruneMatchSessions(store, now);

  assert.equal(kept.length, 0, 'past the retention window the all-done session is pruned');
  assert.equal(isMatchTombstoned('duel-expired-retention', now), true, 'pruned sessions still tombstone');
});

test('POST-FINISH RETENTION: a one-finisher session is untouched by the retention path', () => {
  clearVanishedMatchTombstones();
  const now = new Date();
  const store = buildStore([
    buildDuelSession(now, {
      id: 'duel-one-finisher',
      participants: [
        buildParticipant('u1', {
          liveStatus: 'finished',
          finishedAt: isoAgo(now, 60_000),
          liveUpdatedAt: isoAgo(now, 60_000),
        }),
        buildParticipant('u2', {
          liveStatus: 'running',
          liveUpdatedAt: isoAgo(now, 10_000),
        }),
      ],
    }),
  ]);

  const kept = pruneMatchSessions(store, now);

  assert.equal(kept.length, 1, 'a session with a live runner is kept exactly as before');
});

test('POST-FINISH RETENTION: an all-done session without parseable done stamps drops immediately', () => {
  clearVanishedMatchTombstones();
  const now = new Date();
  const store = buildStore([
    buildDuelSession(now, {
      id: 'duel-legacy-no-stamps',
      participants: [
        buildParticipant('u1', { liveStatus: 'forfeited' }),
        buildParticipant('u2', { liveStatus: 'forfeited' }),
      ],
    }),
  ]);

  const kept = pruneMatchSessions(store, now);

  assert.equal(kept.length, 0, 'legacy rows keep the pre-retention instant-drop behavior');
});
