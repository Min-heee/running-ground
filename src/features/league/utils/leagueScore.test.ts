import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateLeagueScore, compareLeagueScores } from './leagueScore';

test('league score calculates total, participants, and average distance for normal input', () => {
  assert.deepEqual(calculateLeagueScore({
    totalDistanceKm: 123.45,
    participants: 10,
  }), {
    totalDistanceKm: 123.5,
    participants: 10,
    averageDistanceKm: 12.3,
  });
});

test('league score handles zero and invalid inputs safely', () => {
  assert.deepEqual(calculateLeagueScore({
    totalDistanceKm: 0,
    participants: 0,
  }), {
    totalDistanceKm: 0,
    participants: 0,
    averageDistanceKm: 0,
  });

  assert.deepEqual(calculateLeagueScore({
    totalDistanceKm: Number.NaN,
    participants: -3,
  }), {
    totalDistanceKm: 0,
    participants: 0,
    averageDistanceKm: 0,
  });
});

test('league score comparison sorts by average, total, participants, then name', () => {
  const scores = [
    { name: '다', ...calculateLeagueScore({ totalDistanceKm: 100, participants: 10 }) },
    { name: '가', ...calculateLeagueScore({ totalDistanceKm: 110, participants: 10 }) },
    { name: '나', ...calculateLeagueScore({ totalDistanceKm: 100, participants: 9 }) },
    { name: '라', ...calculateLeagueScore({ totalDistanceKm: 100, participants: 10 }) },
  ].sort(compareLeagueScores);

  assert.deepEqual(scores.map((score) => score.name), ['나', '가', '다', '라']);
});
