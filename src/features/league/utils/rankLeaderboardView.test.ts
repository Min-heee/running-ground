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

// ── 공개처형 방지: 입문 0 LP(랭크전 미시작)는 줄 세우지 않는다 ────────────────────

test('unstarted 입문 runners (0 LP) are hidden and ranks renumbered', () => {
  const result = resolveOrderedRankTiers(leaderboard({
    tiers: [
      {
        tier: '입문',
        users: [
          { id: 'a', name: '뛴사람', lp: 30, rankInTier: 1 },
          { id: 'b', name: '안뛴사람', lp: 0, rankInTier: 2 },
          { id: 'c', name: '뛴사람2', lp: 10, rankInTier: 3 },
        ],
      },
    ],
  }));

  const entry = result.find((tierGroup) => tierGroup.tier === '입문');
  assert.deepEqual(entry?.users.map((user) => `${user.rankInTier}:${user.name}`), ['1:뛴사람', '2:뛴사람2']);
});

test('a promoted tier keeps its 0 LP runners (LP resets on promotion)', () => {
  const result = resolveOrderedRankTiers(leaderboard({
    tiers: [
      { tier: '러너', users: [{ id: 'p', name: '승급자', lp: 0, rankInTier: 1 }] },
      { tier: '입문', users: [{ id: 'q', name: '미시작', lp: 0, rankInTier: 1 }] },
    ],
  }));

  assert.equal(result.find((tierGroup) => tierGroup.tier === '러너')?.users.length, 1);
  assert.equal(result.find((tierGroup) => tierGroup.tier === '입문')?.users.length, 0);
});

test('default tier falls back gracefully when the current user is a hidden 입문 0 LP', () => {
  const result = resolveDefaultSelectedTier(leaderboard({
    currentUserId: 'me',
    tiers: [
      { tier: '입문', users: [{ id: 'me', name: '나', lp: 0, rankInTier: 1 }] },
      { tier: '러너', users: [] },
    ],
  }));

  // 숨겨진 자신 대신 첫 랭크(입문)로 — 빈 목록 + 첫 LP 안내 카피가 뜬다.
  assert.equal(result, '입문');
});
