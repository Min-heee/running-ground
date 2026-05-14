import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLiveMatchNavigationKey,
  shouldPromoteLiveMatchArena,
  shouldReuseRecentLiveMatchNavigation,
} from './liveMatchNavigationGate';

test('buildLiveMatchNavigationKey prefers stable matchId key', () => {
  assert.equal(
    buildLiveMatchNavigationKey({
      distanceKm: 5,
      matchId: 'match-1',
      mode: 'duel',
      slotStartAt: '2026-05-14T10:00:00.000Z',
    }),
    'duel:match:match-1',
  );
});

test('buildLiveMatchNavigationKey falls back to schedule inputs without matchId', () => {
  assert.equal(
    buildLiveMatchNavigationKey({
      distanceKm: 5,
      isTestMatch: true,
      mode: 'group',
      slotStartAt: '2026-05-14T10:00:00.000Z',
    }),
    'group:slot:2026-05-14T10:00:00.000Z:5:test',
  );
});

test('shouldPromoteLiveMatchArena keeps active match in arena even when request is passive', () => {
  assert.equal(shouldPromoteLiveMatchArena({ requestedPreferArena: false, matchState: 'active' }), true);
  assert.equal(shouldPromoteLiveMatchArena({ requestedPreferArena: false, matchState: 'matched' }), false);
  assert.equal(shouldPromoteLiveMatchArena({ requestedPreferArena: true, matchState: 'matched' }), true);
});

test('shouldReuseRecentLiveMatchNavigation only reuses the same key inside window', () => {
  assert.equal(
    shouldReuseRecentLiveMatchNavigation({
      completedAtMs: 1_000,
      lastKey: 'duel:match:match-1',
      nextKey: 'duel:match:match-1',
      nowMs: 2_500,
    }),
    true,
  );
  assert.equal(
    shouldReuseRecentLiveMatchNavigation({
      completedAtMs: 1_000,
      lastKey: 'duel:match:match-1',
      nextKey: 'duel:match:match-2',
      nowMs: 2_500,
    }),
    false,
  );
  assert.equal(
    shouldReuseRecentLiveMatchNavigation({
      completedAtMs: 1_000,
      lastKey: 'duel:match:match-1',
      nextKey: 'duel:match:match-1',
      nowMs: 5_500,
    }),
    false,
  );
});
