import assert from 'node:assert/strict';
import test from 'node:test';

import type { MyRunRecord } from '@/domain';
import {
  buildCompetitivePointBasis,
  filterCompetitiveRuns,
  isCompetitiveRun,
} from '@/features/runs/utils/competitiveRuns';

function run(id: string, date: string, distanceKm: number, extra: Partial<MyRunRecord> = {}): MyRunRecord {
  return { id, date, distanceKm, pace: '6:00/km', source: 'RunningGround', ...extra };
}

test('mirrors the backend competitive gate', () => {
  assert.equal(isCompetitiveRun({ sourceType: 'runningground' }), true);
  assert.equal(isCompetitiveRun({ matchResult: { mode: 'duel' } as MyRunRecord['matchResult'] }), true);
  assert.equal(isCompetitiveRun({ sourceType: 'apple_health' }), false);
  assert.equal(isCompetitiveRun({ sourceType: 'health_connect' }), false);
  assert.equal(isCompetitiveRun({ sourceType: 'manual' }), false);
  // Legacy records with no sourceType are non-competitive, same as the server.
  assert.equal(isCompetitiveRun({}), false);
});

test('the point basis sums competitive runs only, on Monday-start weeks', () => {
  // 2026-05-13 is a Wednesday → this week starts Mon 2026-05-11.
  const currentDate = new Date('2026-05-13T12:00:00');
  const runs: MyRunRecord[] = [
    run('tracked-this-week', '2026-05-12', 5, { sourceType: 'runningground' }),
    run('import-this-week', '2026-05-12', 20, { sourceType: 'apple_health' }),
    run('tracked-prev-week', '2026-05-06', 3, { sourceType: 'runningground' }),
    run('tracked-older', '2026-04-01', 10, { sourceType: 'runningground' }),
    run('import-older', '2026-04-02', 50, { sourceType: 'health_connect' }),
  ];

  const basis = buildCompetitivePointBasis(runs, currentDate);

  assert.equal(basis.lifetimeDistanceKm, 18);
  assert.deepEqual(basis.weeklySummary, {
    totalDistanceKm: 5,
    totalRuns: 1,
    previousWeekDistanceKm: 3,
  });
  assert.deepEqual(
    filterCompetitiveRuns(runs).map((entry) => entry.id),
    basis.competitiveRuns.map((entry) => entry.id),
  );
  assert.equal(basis.competitiveRuns.some((entry) => entry.id.startsWith('import')), false);
});
