import assert from 'node:assert/strict';
import test from 'node:test';
import type { RankLeaderboard } from '@/features/league/types/league';
import {
  resolveDefaultSelectedTier,
  resolveOrderedRankTiers,
} from '@/features/league/utils/rankLeaderboardView';

function leaderboard(overrides: Partial<RankLeaderboard> = {}): RankLeaderboard {
  return {
    currentUserId: 'me',
    tiers: [
      { tier: '레이서', users: [] },
      { tier: '입문', users: [] },
      { tier: '엘리트', users: [] },
      { tier: '러너', users: [] },
      { tier: '페이서', users: [] },
    ],
    ...overrides,
  };
}

test('resolveOrderedRankTiers follows the canonical rank tier order', () => {
  const result = resolveOrderedRankTiers(leaderboard());

  assert.deepEqual(result.map((entry) => entry.tier), ['입문', '러너', '페이서', '레이서', '엘리트']);
});

test('resolveOrderedRankTiers keeps unknown tiers after known tiers', () => {
  const result = resolveOrderedRankTiers(leaderboard({
    tiers: [
      { tier: '마스터', users: [] },
      { tier: '러너', users: [] },
      { tier: '입문', users: [] },
    ],
  }));

  assert.deepEqual(result.map((entry) => entry.tier), ['입문', '러너', '마스터']);
});

test('resolveDefaultSelectedTier selects the current user tier first', () => {
  const result = resolveDefaultSelectedTier(leaderboard({
    currentUserId: 'me',
    tiers: [
      { tier: '입문', users: [{ id: 'other', name: '상대', lp: 10, rankInTier: 1 }] },
      { tier: '페이서', users: [{ id: 'me', name: '나', lp: 260, rankInTier: 4 }] },
    ],
  }));

  assert.equal(result, '페이서');
});

test('resolveDefaultSelectedTier falls back to the first ordered tier', () => {
  const result = resolveDefaultSelectedTier(leaderboard({
    currentUserId: 'missing',
    tiers: [
      { tier: '엘리트', users: [] },
      { tier: '러너', users: [] },
    ],
  }));

  assert.equal(result, '러너');
});

test('rank leaderboard view helpers are null safe', () => {
  assert.deepEqual(resolveOrderedRankTiers(null), []);
  assert.equal(resolveDefaultSelectedTier(null), null);
});
