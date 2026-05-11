import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  DuelMatchOpponent,
  GroupMatchParticipant,
} from '@/lib/api/types';
import {
  buildAverageArenaPaceLabel,
  buildDuelComparisonSnapshot,
  buildGroupLiveStandings,
  buildParticipantAveragePaceLabel,
  parsePaceSecondsPerKm,
  resolveParticipantDisplayDistanceKm,
} from './matchProgress';

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

test('pace helpers return stable average pace labels', () => {
  assert.equal(parsePaceSecondsPerKm('06:20/km'), 380);
  assert.equal(parsePaceSecondsPerKm('not-a-pace'), 330);
  assert.equal(buildAverageArenaPaceLabel(1, 380, true), '06:20/km');
  assert.equal(buildAverageArenaPaceLabel(1, 380, false), '');
  assert.equal(buildParticipantAveragePaceLabel({ ...baseOpponent, officialAveragePace: '06:10/km' }, true), '06:10/km');
});

test('resolveParticipantDisplayDistanceKm prefers live distance and estimates from pace only as fallback', () => {
  assert.equal(resolveParticipantDisplayDistanceKm({ liveDistanceKm: 1.234 }, 5), 1.23);
  assert.equal(resolveParticipantDisplayDistanceKm({ liveElapsedSeconds: 380, livePace: '06:20/km' }, 5), 1);
  assert.equal(resolveParticipantDisplayDistanceKm({ liveElapsedSeconds: 5000, livePace: '06:20/km' }, 5), 5);
  assert.equal(resolveParticipantDisplayDistanceKm({ liveElapsedSeconds: 380 }, 5), 0);
});

test('buildDuelComparisonSnapshot compares both runners at the same 30-second checkpoint', () => {
  const snapshot = buildDuelComparisonSnapshot(
    {
      matchId: 'match-1',
      distanceKm: 0.7,
      elapsedSeconds: 70,
      currentPace: '05:00/km',
      updatedAt: 1,
    },
    {
      ...baseOpponent,
      liveDistanceKm: 0.6,
      liveElapsedSeconds: 65,
      livePace: '05:25/km',
      liveUpdatedAt: '2026-05-12T00:01:05.000Z',
    },
    5,
  );

  assert.deepEqual(snapshot, {
    checkpointSeconds: 60,
    currentDistanceKm: 0.6,
    opponentDistanceKm: 0.55,
    gapKm: 0.05,
  });
});

test('buildDuelComparisonSnapshot waits until a fair common checkpoint exists', () => {
  const snapshot = buildDuelComparisonSnapshot(
    {
      matchId: 'match-1',
      distanceKm: 0.2,
      elapsedSeconds: 29,
      currentPace: '05:00/km',
      updatedAt: 1,
    },
    {
      ...baseOpponent,
      liveDistanceKm: 0.2,
      liveElapsedSeconds: 29,
      liveUpdatedAt: '2026-05-12T00:00:29.000Z',
    },
    5,
  );

  assert.equal(snapshot, null);
});

test('buildGroupLiveStandings ranks distance first and pushes forfeited runners down', () => {
  const standings = buildGroupLiveStandings(
    [
      participant({ id: 'me', name: '나', seedRank: 2 }),
      participant({ id: 'leader', name: '선두', seedRank: 1, liveDistanceKm: 1.2, liveUpdatedAt: '2026-05-12T00:02:00.000Z' }),
      participant({ id: 'forfeit', name: '기권', seedRank: 3, liveDistanceKm: 2, liveStatus: 'forfeited', liveUpdatedAt: '2026-05-12T00:02:00.000Z' }),
    ],
    2,
    1,
    380,
    5,
  );

  assert.deepEqual(standings.map((standing) => [standing.id, standing.rank, standing.isCurrentUser, standing.isForfeited]), [
    ['leader', 1, false, false],
    ['me', 2, true, false],
    ['forfeit', 3, false, true],
  ]);
  assert.equal(standings[1].gapAheadKm, 0.2);
});

test('buildGroupLiveStandings trusts official server ranks when available', () => {
  const standings = buildGroupLiveStandings(
    [
      participant({ id: 'me', seedRank: 2, officialReady: true, officialRank: 1, officialDistanceKm: 1.1, officialGapAheadKm: null, officialGapLeaderKm: 0 }),
      participant({ id: 'other', seedRank: 1, officialReady: true, officialRank: 2, officialDistanceKm: 1, officialGapAheadKm: 0.1, officialGapLeaderKm: 0.1 }),
    ],
    2,
    0.5,
    180,
    5,
  );

  assert.deepEqual(standings.map((standing) => [standing.id, standing.rank, standing.currentDistanceKm]), [
    ['me', 1, 1.1],
    ['other', 2, 1],
  ]);
});
