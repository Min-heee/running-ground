import assert from 'node:assert/strict';
import test from 'node:test';

import type { MyActivityResponse } from '@/lib/api/types';
import { buildMatchRecordStats } from './matchRecordStats';

function activity(runs: MyActivityResponse['runs']): MyActivityResponse {
  return {
    runs,
    monthlyDistanceKm: 0,
    monthlyPoints: 0,
  };
}

function run(
  id: string,
  matchResult?: MyActivityResponse['runs'][number]['matchResult'],
): MyActivityResponse['runs'][number] {
  return {
    id,
    date: '2026-06-01',
    distanceKm: 5,
    pace: '06:00/km',
    source: 'RunningGround',
    sourceType: 'runningground',
    matchResult,
  };
}

test('match record stats exclude party runs but keep official and legacy match results', () => {
  const stats = buildMatchRecordStats(activity([
    run('solo'),
    run('party-duel', {
      mode: 'duel',
      source: 'party',
      title: '',
      summary: '',
      badgeLabel: '',
      resultTone: 'win',
    }),
    run('official-duel', {
      mode: 'duel',
      source: 'official',
      title: '',
      summary: '',
      badgeLabel: '',
      resultTone: 'win',
    }),
    run('legacy-group', {
      mode: 'group',
      title: '',
      summary: '',
      badgeLabel: '',
      rank: 2,
    }),
  ]));

  assert.deepEqual(stats.matchRuns.map((matchRun) => matchRun.id), ['official-duel', 'legacy-group']);
  assert.equal(stats.duelRuns.length, 1);
  assert.equal(stats.groupRuns.length, 1);
  assert.equal(stats.duelWins, 1);
  assert.equal(stats.groupPodiumCount, 1);
});
