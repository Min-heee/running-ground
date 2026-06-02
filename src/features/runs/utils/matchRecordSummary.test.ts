import assert from 'node:assert/strict';
import test from 'node:test';

import type { MyRunRecord } from '@/domain';
import { buildMatchRecordSummary } from './matchRecordSummary';

function run(overrides: Partial<MyRunRecord>): MyRunRecord {
  return {
    id: overrides.id ?? 'run',
    date: overrides.date ?? '2026-06-01',
    distanceKm: overrides.distanceKm ?? 5,
    pace: overrides.pace ?? '06:00/km',
    source: overrides.source ?? 'RunningGround',
    sourceType: overrides.sourceType ?? 'runningground',
    matchResult: overrides.matchResult,
  };
}

test('match record summary counts duel and group match runs', () => {
  const summary = buildMatchRecordSummary([
    run({ id: 'duel-a', matchResult: { mode: 'duel', title: '', summary: '', badgeLabel: '' } }),
    run({ id: 'group-a', matchResult: { mode: 'group', title: '', summary: '', badgeLabel: '' } }),
    run({ id: 'duel-b', matchResult: { mode: 'duel', title: '', summary: '', badgeLabel: '' } }),
  ]);

  assert.deepEqual(summary, {
    duelCount: 2,
    groupCount: 1,
    totalCount: 3,
  });
});

test('match record summary ignores non-match runs', () => {
  const summary = buildMatchRecordSummary([
    run({ id: 'solo' }),
    run({ id: 'duel', matchResult: { mode: 'duel', title: '', summary: '', badgeLabel: '' } }),
  ]);

  assert.deepEqual(summary, {
    duelCount: 1,
    groupCount: 0,
    totalCount: 1,
  });
});

test('match record summary excludes party runs from official match record counts', () => {
  const summary = buildMatchRecordSummary([
    run({
      id: 'party-duel',
      matchResult: { mode: 'duel', source: 'party', title: '', summary: '', badgeLabel: '' },
    }),
    run({
      id: 'official-duel',
      matchResult: { mode: 'duel', source: 'official', title: '', summary: '', badgeLabel: '' },
    }),
    run({
      id: 'legacy-group',
      matchResult: { mode: 'group', title: '', summary: '', badgeLabel: '' },
    }),
  ]);

  assert.deepEqual(summary, {
    duelCount: 1,
    groupCount: 1,
    totalCount: 2,
  });
});

test('match record summary is safe for empty or missing runs', () => {
  assert.deepEqual(buildMatchRecordSummary([]), { duelCount: 0, groupCount: 0, totalCount: 0 });
  assert.deepEqual(buildMatchRecordSummary(null), { duelCount: 0, groupCount: 0, totalCount: 0 });
  assert.deepEqual(buildMatchRecordSummary(undefined), { duelCount: 0, groupCount: 0, totalCount: 0 });
});
