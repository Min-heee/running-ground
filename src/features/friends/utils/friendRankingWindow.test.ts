import assert from 'node:assert/strict';
import test from 'node:test';

import type { FriendRank } from '@/domain';
import { buildFriendRankingWindowRanks } from './friendRankingWindow';

function buildRank(overrides: Partial<FriendRank> & { id: string; name: string }): FriendRank {
  return {
    rank: 0,
    distanceKm: 0,
    points: 0,
    ...overrides,
  };
}

test('today window shows the real server aggregates — zero runs stays zero', () => {
  const ranks = [
    buildRank({
      id: 'me', name: '회원G', rank: 1, distanceKm: 0, points: 0, todayDistanceKm: 0, todayPoints: 0, monthDistanceKm: 0, monthPoints: 0,
    }),
  ];

  const [mine] = buildFriendRankingWindowRanks(ranks, 'today');

  // The old fabricated formula turned this exact case into 0.2km / 1P.
  assert.equal(mine.distanceKm, 0);
  assert.equal(mine.points, 0);
});

test('window values come from the matching server fields and re-rank per window', () => {
  const ranks = [
    buildRank({
      id: 'a', name: '가람', rank: 1, distanceKm: 20, points: 40, todayDistanceKm: 0, todayPoints: 0, monthDistanceKm: 30, monthPoints: 55,
    }),
    buildRank({
      id: 'b', name: '나래', rank: 2, distanceKm: 10, points: 20, todayDistanceKm: 5, todayPoints: 12, monthDistanceKm: 80, monthPoints: 90,
    }),
  ];

  const week = buildFriendRankingWindowRanks(ranks, 'week');
  assert.deepEqual(week.map((runner) => [runner.id, runner.rank, runner.distanceKm]), [['a', 1, 20], ['b', 2, 10]]);

  const today = buildFriendRankingWindowRanks(ranks, 'today');
  assert.deepEqual(today.map((runner) => [runner.id, runner.rank, runner.distanceKm, runner.points]), [
    ['b', 1, 5, 12],
    ['a', 2, 0, 0],
  ]);

  const month = buildFriendRankingWindowRanks(ranks, 'month');
  assert.deepEqual(month.map((runner) => [runner.id, runner.rank, runner.distanceKm, runner.points]), [
    ['b', 1, 80, 90],
    ['a', 2, 30, 55],
  ]);
});

test('pre-upgrade server without the new fields: today falls to 0, month falls to the week value', () => {
  const ranks = [
    buildRank({ id: 'a', name: '가람', rank: 1, distanceKm: 14, points: 21 }),
  ];

  const [today] = buildFriendRankingWindowRanks(ranks, 'today');
  assert.equal(today.distanceKm, 0);
  assert.equal(today.points, 0);

  const [month] = buildFriendRankingWindowRanks(ranks, 'month');
  assert.equal(month.distanceKm, 14);
  assert.equal(month.points, 21);
});

test('distance ties break by points, then Korean name order', () => {
  const ranks = [
    buildRank({ id: 'a', name: '나래', rank: 1, distanceKm: 5, points: 10, todayDistanceKm: 1, todayPoints: 3 }),
    buildRank({ id: 'b', name: '가람', rank: 2, distanceKm: 5, points: 10, todayDistanceKm: 1, todayPoints: 3 }),
  ];

  const today = buildFriendRankingWindowRanks(ranks, 'today');
  assert.deepEqual(today.map((runner) => runner.id), ['b', 'a']);
});
