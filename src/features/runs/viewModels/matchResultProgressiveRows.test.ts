import assert from 'node:assert/strict';
import test from 'node:test';
import type { DuelMatchOpponent } from '@/lib/api/types';
import type { GroupLiveStanding } from '@/features/runs/viewModels/matchProgress';
import {
  buildDuelMatchFinishModel,
  buildGroupMatchFinishModel,
} from './matchResultModel';

function opponent(overrides: Partial<DuelMatchOpponent> = {}): DuelMatchOpponent {
  return {
    id: 'opponent',
    name: '상대',
    tag: '#OPP',
    districtName: '일산동구',
    averagePace: '06:20/km',
    levelLabel: 'Lv.4',
    weeklyDistanceKm: 20,
    lifetimeDistanceKm: 120,
    compatibilitySummary: '비슷한 러너',
    ...overrides,
  };
}

function standing(overrides: Partial<GroupLiveStanding> = {}): GroupLiveStanding {
  return {
    id: 'runner',
    name: '러너',
    districtName: '일산서구',
    averagePace: '06:20/km',
    levelLabel: 'Lv.4',
    weeklyDistanceKm: 20,
    lifetimeDistanceKm: 120,
    seedRank: 1,
    seedSummary: '1번 시드',
    rank: 1,
    currentDistanceKm: 1,
    gapAheadKm: null,
    gapLeaderKm: 0,
    isForfeited: false,
    isCurrentUser: false,
    liveStatus: 'running',
    liveDistanceKm: 1,
    liveElapsedSeconds: 360,
    liveUpdatedAt: '2026-05-12T00:06:00.000Z',
    ...overrides,
  };
}

test('duel result shows an in-progress opponent placeholder after current user finishes first', () => {
  const result = buildDuelMatchFinishModel({
    opponent: opponent({
      liveDistanceKm: 1.1,
      liveElapsedSeconds: 600,
      livePace: '09:05/km',
      liveUpdatedAt: '2026-05-12T00:10:00.000Z',
      liveStatus: 'running',
    }),
    currentDistanceKm: 5,
    targetDistanceKm: 5,
    currentElapsedSeconds: 1500,
    currentPaceLabel: '05:00/km',
    currentUserLiveStatus: 'finished',
  });

  assert.equal(result?.matchResult.resultTone, 'win');
  assert.equal(result?.rows[0].isCurrentUser, true);
  assert.equal(result?.rows[0].resultLabel, 'WIN');
  assert.equal(result?.rows[1].isCurrentUser, false);
  assert.equal(result?.rows[1].resultLabel, 'ING');
  assert.equal(result?.rows[1].paceLabel, '진행 중');
  assert.equal(result?.rows[1].durationLabel, '-');
  assert.equal(result?.rows[1].isInProgress, true);
  assert.match(result?.summary ?? '', /자동으로 업데이트/);
});

test('group result keeps unfinished runners as in-progress placeholders after current user finishes', () => {
  const standings = [
    standing({
      id: 'me',
      name: '나',
      rank: 1,
      currentDistanceKm: 5,
      isCurrentUser: true,
      liveStatus: 'finished',
      liveElapsedSeconds: 1500,
    }),
    standing({
      id: 'runner-2',
      name: '2등 후보',
      rank: 2,
      currentDistanceKm: 3.2,
      liveStatus: 'running',
      liveElapsedSeconds: 1200,
    }),
  ];

  const result = buildGroupMatchFinishModel({
    currentStanding: standings[0],
    participantCount: 2,
    standings,
    currentPaceLabel: '05:00/km',
    currentElapsedSeconds: 1500,
    targetDistanceKm: 5,
  });

  assert.equal(result?.rows.length, 2);
  assert.equal(result?.rows[0].isInProgress, false);
  assert.equal(result?.rows[1].isInProgress, true);
  assert.equal(result?.rows[1].paceLabel, '진행 중');
  assert.equal(result?.rows[1].durationLabel, '-');
  assert.match(result?.statusLabel ?? '', /진행중/);
});

test('group result replaces placeholders with real rows as runners finish', () => {
  const baseStanding = standing({
    id: 'me',
    name: '나',
    rank: 1,
    currentDistanceKm: 5,
    isCurrentUser: true,
    liveStatus: 'finished',
    liveElapsedSeconds: 1500,
  });
  const progressiveResult = buildGroupMatchFinishModel({
    currentStanding: baseStanding,
    participantCount: 2,
    standings: [
      baseStanding,
      standing({ id: 'runner-2', rank: 2, currentDistanceKm: 4.8, liveStatus: 'running' }),
    ],
    currentPaceLabel: '05:00/km',
    currentElapsedSeconds: 1500,
    targetDistanceKm: 5,
  });
  const completedResult = buildGroupMatchFinishModel({
    currentStanding: baseStanding,
    participantCount: 2,
    standings: [
      baseStanding,
      standing({ id: 'runner-2', rank: 2, currentDistanceKm: 5, liveStatus: 'finished', liveElapsedSeconds: 1700 }),
    ],
    currentPaceLabel: '05:00/km',
    currentElapsedSeconds: 1500,
    targetDistanceKm: 5,
  });

  assert.equal(progressiveResult?.rows[1].isInProgress, true);
  assert.equal(completedResult?.rows[1].isInProgress, false);
  assert.notEqual(completedResult?.rows[1].durationLabel, '-');
});
