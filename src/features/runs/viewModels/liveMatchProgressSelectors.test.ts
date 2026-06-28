import assert from 'node:assert/strict';
import test from 'node:test';
import type { DuelMatchOpponent, GroupMatchParticipant } from '@/lib/api/types';
import {
  buildDuelStatusAlert,
  buildGroupLiveProgressModel,
} from './liveMatchProgressSelectors';

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

const baseOpponent: DuelMatchOpponent = {
  id: 'opponent',
  name: '상대',
  districtName: '일산서구',
  averagePace: '06:20/km',
  levelLabel: 'Lv.20',
  weeklyDistanceKm: 20,
  lifetimeDistanceKm: 200,
  compatibilitySummary: '테스트',
};

test('buildGroupLiveProgressModel keeps group standings NON-empty and carrying live distances when deferRankingCalculations is true', () => {
  const model = buildGroupLiveProgressModel({
    deferRankingCalculations: true,
    matchMode: 'group',
    participants: [
      participant({ id: 'me', seedRank: 1 }),
      participant({ id: 'other', seedRank: 2, liveDistanceKm: 1 }),
    ],
    seedRank: 1,
    distanceKm: 0.5,
    targetDistanceKm: 5,
  });

  // Step 3: rows are ALWAYS present (never blanked to []) so every participant renders,
  // on both platforms, even while the startup gate defers heavy decoration.
  assert.equal(model.groupLiveStandings.length, 2);
  assert.deepEqual(
    [...model.groupLiveStandings].map((row) => row.id).sort(),
    ['me', 'other'],
  );

  // The non-self rival carries its REAL live distance (1km), not 0.00 / 측정 대기.
  const other = model.groupLiveStandings.find((row) => row.id === 'other');
  assert.equal(other?.currentDistanceKm, 1);
  // My row carries my measured distance.
  const me = model.groupLiveStandings.find((row) => row.id === 'me');
  assert.equal(me?.currentDistanceKm, 0.5);
});

test('buildGroupLiveProgressModel shows neutral pending (no fabricated ranks) while deferRankingCalculations is true', () => {
  const model = buildGroupLiveProgressModel({
    deferRankingCalculations: true,
    matchMode: 'group',
    participants: [
      participant({ id: 'me', seedRank: 1 }),
      participant({ id: 'other', seedRank: 2, liveDistanceKm: 1 }),
    ],
    seedRank: 1,
    distanceKm: 0.5,
    targetDistanceKm: 5,
  });

  // Heavy rank/gap decoration is deferred: rows carry NEUTRAL rank/gap, and the rank-keyed
  // snapshot stays pending instead of surfacing bogus leader/ahead/behind framing.
  model.groupLiveStandings.forEach((row) => {
    assert.equal(row.rank, 0);
    assert.equal(row.gapAheadKm, null);
    assert.equal(row.gapLeaderKm, 0);
  });
  assert.equal(model.currentGroupStanding, null);
  assert.equal(model.currentGroupLeader, null);
  assert.equal(model.groupAheadParticipant, null);
  assert.equal(model.groupBehindParticipant, null);
  assert.equal(model.featuredGroupArenaParticipantIds.size, 0);
});

test('buildGroupLiveProgressModel decorates ranks once decoration is no longer deferred', () => {
  const deferred = buildGroupLiveProgressModel({
    deferRankingCalculations: true,
    matchMode: 'group',
    participants: [
      participant({ id: 'me', seedRank: 1 }),
      participant({ id: 'other', seedRank: 2, liveDistanceKm: 1 }),
    ],
    seedRank: 1,
    distanceKm: 0.5,
    targetDistanceKm: 5,
  });
  const settled = buildGroupLiveProgressModel({
    deferRankingCalculations: false,
    matchMode: 'group',
    participants: [
      participant({ id: 'me', seedRank: 1 }),
      participant({ id: 'other', seedRank: 2, liveDistanceKm: 1 }),
    ],
    seedRank: 1,
    distanceKm: 0.5,
    targetDistanceKm: 5,
  });

  // Same rows + distances either way; only the rank/gap polish + snapshot differ.
  assert.equal(deferred.groupLiveStandings.length, settled.groupLiveStandings.length);
  // 'other' ran 1km vs my 0.5km, so once decorated the leader is 'other' at rank 1.
  assert.equal(settled.currentGroupLeader?.id, 'other');
  assert.equal(settled.currentGroupStanding?.id, 'me');
  assert.ok(settled.groupLiveStandings.every((row) => row.rank > 0));
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
    targetDistanceKm: 5,
  });

  assert.equal(model.groupLiveStandings.length, 2);
  assert.equal(model.currentGroupStanding?.id, 'me');
  assert.equal(model.currentGroupLeader?.id, 'other');
});

test('duel status alert surfaces opponent forfeit ahead of ready fallback copy', () => {
  const alert = buildDuelStatusAlert({
    ...baseOpponent,
    liveStatus: 'forfeited',
  });

  assert.equal(alert?.tone, 'danger');
  assert.equal(alert?.title, '상대가 매치를 포기했어요');
  assert.match(alert?.summary ?? '', /대결종료/);
  assert.doesNotMatch(alert?.summary ?? '', /혼자/);
});

test('duel status alert still treats ready as a non-terminal verification state', () => {
  const alert = buildDuelStatusAlert({
    ...baseOpponent,
    liveStatus: 'ready',
  });

  assert.equal(alert?.tone, 'neutral');
  assert.equal(alert?.title, '상대 상태를 다시 확인 중이에요');
});
