import assert from 'node:assert/strict';
import test from 'node:test';

import { INITIAL_RANK } from './rankSystem.mjs';
import {
  buildProfileWithMetrics,
  ensureUserRankState,
} from './userStoreHelpers.mjs';

test('ensureUserRankState backfills missing rank state', () => {
  const user = {};

  assert.deepEqual(ensureUserRankState(user), INITIAL_RANK);
  assert.deepEqual(user.rankState, INITIAL_RANK);
});

test('ensureUserRankState replaces malformed rank state', () => {
  const user = {
    rankState: {
      tier: '마스터',
      division: 0,
      lp: -10,
    },
  };

  assert.deepEqual(ensureUserRankState(user), INITIAL_RANK);
  assert.deepEqual(user.rankState, INITIAL_RANK);
});

test('ensureUserRankState preserves existing valid rank state', () => {
  const rankState = {
    tier: '러너',
    lp: 45,
  };
  const user = { rankState };

  assert.strictEqual(ensureUserRankState(user), rankState);
  assert.strictEqual(user.rankState, rankState);
});

test('buildProfileWithMetrics exposes rank state with legacy fallback', () => {
  const user = {
    name: '러너',
    districtName: '강남구',
    publicTag: '#RUN01',
  };
  const profile = buildProfileWithMetrics(user, {
    lifetimeDistanceKm: 12.3,
  });

  assert.deepEqual(profile.rankState, INITIAL_RANK);
  assert.deepEqual(user.rankState, INITIAL_RANK);
});
