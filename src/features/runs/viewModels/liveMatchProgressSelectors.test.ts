import assert from 'node:assert/strict';
import test from 'node:test';
import type { GroupMatchParticipant } from '@/lib/api/types';
import { buildGroupLiveProgressModel } from './liveMatchProgressSelectors';

function participant(overrides: Partial<GroupMatchParticipant>): GroupMatchParticipant {
  return {
    id: overrides.id ?? 'runner',
    name: overrides.name ?? '러너',
    districtName: '일산서구',
    averagePace: '06:20/km',
    levelLabel: 'Lv.20',
    weeklyDistanceKm: 20,
    lifetimeDistanceKm: 200,
    seedRank: 1,
    seedSummary: '1번 시드',
    ...overrides,
  };
}

test('buildGroupLiveProgressModel defers group ranking calculations when requested', () => {
  const model = buildGroupLiveProgressModel({
    deferRankingCalculations: true,
    matchMode: 'group',
    participants: [
      participant({ id: 'me', seedRank: 1 }),
      participant({ id: 'other', seedRank: 2, liveDistanceKm: 1 }),
    ],
    seedRank: 1,
    distanceKm: 0.5,
    elapsedSeconds: 300,
    targetDistanceKm: 5,
  });

  assert.deepEqual(model.groupLiveStandings, []);
  assert.equal(model.currentGroupStanding, null);
  assert.equal(model.currentGroupLeader, null);
  assert.equal(model.groupStatusAlert, null);
});

test('buildGroupLiveProgressModel keeps non-group ranking behavior unchanged', () => {
  const model = buildGroupLiveProgressModel({
    deferRankingCalculations: true,
    matchMode: 'duel',
    participants: [
      participant({ id: 'me', name: '나', seedRank: 1 }),
      participant({ id: 'other', name: '상대', seedRank: 2, liveDistanceKm: 1 }),
    ],
    seedRank: 1,
    distanceKm: 0.5,
    elapsedSeconds: 300,
    targetDistanceKm: 5,
  });

  assert.equal(model.groupLiveStandings.length, 2);
  assert.equal(model.currentGroupStanding?.id, 'me');
  assert.equal(model.currentGroupLeader?.id, 'other');
});
