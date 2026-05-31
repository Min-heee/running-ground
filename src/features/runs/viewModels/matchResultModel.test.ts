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

test('duel result records current user forfeit as loss even when distance is ahead', () => {
  const result = buildDuelMatchFinishModel({
    opponent: opponent({
      liveDistanceKm: 0.6,
      liveElapsedSeconds: 360,
      liveUpdatedAt: '2026-05-12T00:06:00.000Z',
      liveStatus: 'running',
    }),
    currentDistanceKm: 1.2,
    targetDistanceKm: 5,
    currentElapsedSeconds: 360,
    currentPaceLabel: '05:00/km',
    currentUserLiveStatus: 'forfeited',
  });

  assert.equal(result?.matchResult.resultTone, 'lose');
  assert.equal(result?.matchResult.badgeLabel, '기권 패');
  assert.equal(result?.rows[0].isCurrentUser, false);
  assert.equal(result?.rows[0].resultLabel, 'WIN');
  assert.equal(result?.rows[1].isCurrentUser, true);
  assert.equal(result?.rows[1].resultLabel, 'FORFEIT');
});

test('duel result records opponent forfeit as win', () => {
  const result = buildDuelMatchFinishModel({
    opponent: opponent({
      liveDistanceKm: 0.8,
      liveElapsedSeconds: 420,
      liveUpdatedAt: '2026-05-12T00:07:00.000Z',
      liveStatus: 'forfeited',
    }),
    currentDistanceKm: 0.7,
    targetDistanceKm: 5,
    currentElapsedSeconds: 420,
    currentPaceLabel: '10:00/km',
    currentUserLiveStatus: 'running',
  });

  assert.equal(result?.matchResult.resultTone, 'win');
  assert.equal(result?.matchResult.badgeLabel, '상대 기권 승');
  assert.equal(result?.rows[0].isCurrentUser, true);
  assert.equal(result?.rows[0].resultLabel, 'WIN');
  assert.equal(result?.rows[1].isCurrentUser, false);
  assert.equal(result?.rows[1].resultLabel, 'FORFEIT');
});

test('duel result freezes forfeited opponent duration instead of projecting current elapsed', () => {
  const result = buildDuelMatchFinishModel({
    opponent: opponent({
      liveDistanceKm: 0.2,
      liveStatus: 'forfeited',
    }),
    currentDistanceKm: 0.7,
    targetDistanceKm: 5,
    currentElapsedSeconds: 420,
    currentPaceLabel: '10:00/km',
    currentUserLiveStatus: 'running',
  });

  const opponentRow = result?.rows.find((row) => !row.isCurrentUser);
  assert.equal(opponentRow?.resultLabel, 'FORFEIT');
  assert.equal(opponentRow?.durationLabel, '00:00');
  assert.equal(opponentRow?.paceLabel, '기권');
});

test('duel result keeps forfeited opponent final duration when both users forfeit', () => {
  const result = buildDuelMatchFinishModel({
    opponent: opponent({
      liveDistanceKm: 0.2,
      liveElapsedSeconds: 67,
      liveStatus: 'forfeited',
    }),
    currentDistanceKm: 0.3,
    targetDistanceKm: 5,
    currentElapsedSeconds: 91,
    currentPaceLabel: '05:03/km',
    currentUserLiveStatus: 'forfeited',
  });

  const opponentRow = result?.rows.find((row) => !row.isCurrentUser);
  assert.equal(result?.matchResult.resultTone, 'lose');
  assert.equal(opponentRow?.resultLabel, 'FORFEIT');
  assert.equal(opponentRow?.durationLabel, '01:07');
});

test('duel result records normal finish by compared distance', () => {
  const result = buildDuelMatchFinishModel({
    opponent: opponent({
      officialReady: true,
      officialDistanceKm: 1.1,
      officialElapsedSeconds: 600,
      officialAveragePace: '09:05/km',
      officialRank: 2,
      liveStatus: 'finished',
    }),
    currentDistanceKm: 1.25,
    targetDistanceKm: 5,
    currentElapsedSeconds: 600,
    currentPaceLabel: '08:00/km',
    currentUserLiveStatus: 'finished',
  });

  assert.equal(result?.matchResult.resultTone, 'win');
  assert.equal(result?.matchResult.comparedDistanceKm, 1.1);
  assert.equal(result?.matchResult.gapKm, 0.15);
  assert.equal(result?.rows.some((row) => row.isInProgress), false);
});

test('duel result surfaces live opponent pace and duration while opponent keeps running', () => {
  const result = buildDuelMatchFinishModel({
    opponent: opponent({
      liveDistanceKm: 3.1,
      liveElapsedSeconds: 1200,
      livePace: '06:27/km',
      liveUpdatedAt: '2026-05-12T00:20:00.000Z',
      liveStatus: 'running',
    }),
    currentDistanceKm: 5,
    targetDistanceKm: 5,
    currentElapsedSeconds: 1500,
    currentPaceLabel: '05:00/km',
    currentUserLiveStatus: 'finished',
  });

  const opponentRow = result?.rows.find((row) => !row.isCurrentUser);
  assert.equal(opponentRow?.resultLabel, 'ING');
  assert.equal(opponentRow?.paceLabel, '06:27/km');
  assert.equal(opponentRow?.durationLabel, '20:00');
  assert.equal(opponentRow?.isInProgress, true);
});

test('duel result keeps in-progress opponent placeholders until live elapsed exists', () => {
  const result = buildDuelMatchFinishModel({
    opponent: opponent({
      liveStatus: 'running',
    }),
    currentDistanceKm: 5,
    targetDistanceKm: 5,
    currentElapsedSeconds: 1500,
    currentPaceLabel: '05:00/km',
    currentUserLiveStatus: 'finished',
  });

  const opponentRow = result?.rows.find((row) => !row.isCurrentUser);
  assert.equal(opponentRow?.resultLabel, 'ING');
  assert.equal(opponentRow?.paceLabel, '진행 중');
  assert.equal(opponentRow?.durationLabel, '-');
});

test('duel result records normal loss when opponent distance is ahead', () => {
  const result = buildDuelMatchFinishModel({
    opponent: opponent({
      officialReady: true,
      officialDistanceKm: 1.4,
      officialElapsedSeconds: 600,
      officialAveragePace: '07:09/km',
      officialRank: 1,
      liveStatus: 'finished',
    }),
    currentDistanceKm: 1.1,
    targetDistanceKm: 5,
    currentElapsedSeconds: 600,
    currentPaceLabel: '09:05/km',
    currentUserLiveStatus: 'finished',
  });

  assert.equal(result?.matchResult.resultTone, 'lose');
  assert.equal(result?.matchResult.badgeLabel, '패배');
  assert.equal(result?.rows[0].isCurrentUser, false);
  assert.equal(result?.rows[0].resultLabel, 'WIN');
  assert.equal(result?.rows[1].isCurrentUser, true);
  assert.equal(result?.rows[1].resultLabel, 'LOSER');
});

test('duel result records near-equal distances as draw', () => {
  const result = buildDuelMatchFinishModel({
    opponent: opponent({
      liveDistanceKm: 1.02,
      liveElapsedSeconds: 600,
      livePace: '09:48/km',
      liveUpdatedAt: '2026-05-12T00:10:00.000Z',
      liveStatus: 'finished',
    }),
    currentDistanceKm: 1,
    targetDistanceKm: 5,
    currentElapsedSeconds: 600,
    currentPaceLabel: '10:00/km',
    currentUserLiveStatus: 'finished',
  });

  assert.equal(result?.matchResult.resultTone, 'draw');
  assert.equal(result?.matchResult.badgeLabel, '무승부');
  assert.deepEqual(result?.rows.map((row) => row.resultLabel), ['DRAW', 'DRAW']);
});

test('duel result returns null when opponent data is missing', () => {
  const result = buildDuelMatchFinishModel({
    opponent: null,
    currentDistanceKm: 0,
    targetDistanceKm: 5,
    currentElapsedSeconds: 0,
    currentPaceLabel: '--:--/km',
    currentUserLiveStatus: null,
  });

  assert.equal(result, null);
});

test('group result records current rank and keeps updated standings order', () => {
  const standings = [
    standing({ id: 'leader', name: '1등', rank: 1, currentDistanceKm: 2.2, gapAheadKm: null, gapLeaderKm: 0, liveStatus: 'finished' }),
    standing({
      id: 'me',
      name: '나',
      rank: 2,
      currentDistanceKm: 2,
      gapAheadKm: 0.2,
      gapLeaderKm: 0.2,
      isCurrentUser: true,
      liveStatus: 'finished',
    }),
    standing({ id: 'third', name: '3등', rank: 3, currentDistanceKm: 1.7, gapAheadKm: 0.3, gapLeaderKm: 0.5, liveStatus: 'finished' }),
  ];

  const result = buildGroupMatchFinishModel({
    currentStanding: standings[1],
    participantCount: 3,
    standings,
    currentPaceLabel: '05:00/km',
    currentElapsedSeconds: 600,
    targetDistanceKm: 5,
  });

  assert.equal(result?.matchResult.mode, 'group');
  assert.equal(result?.matchResult.rank, 2);
  assert.equal(result?.matchResult.participantCount, 3);
  assert.deepEqual(result?.rows.map((row) => row.id), ['leader', 'me', 'third']);
  assert.equal(result?.rows.some((row) => row.isInProgress), false);
});

test('group result records current user forfeit with forfeit badge and bottom rank', () => {
  const standings = [
    standing({ id: 'leader', name: '1등', rank: 1, currentDistanceKm: 1.4 }),
    standing({
      id: 'me',
      name: '나',
      rank: 2,
      currentDistanceKm: 1.1,
      isCurrentUser: true,
      isForfeited: true,
      liveStatus: 'forfeited',
      gapAheadKm: 0.3,
      gapLeaderKm: 0.3,
    }),
  ];

  const result = buildGroupMatchFinishModel({
    currentStanding: standings[1],
    participantCount: 2,
    standings,
    currentPaceLabel: '06:10/km',
    currentElapsedSeconds: 420,
    targetDistanceKm: 5,
  });

  assert.equal(result?.matchResult.badgeLabel, '기권');
  assert.equal(result?.matchResult.rank, 2);
  assert.match(result?.matchResult.title ?? '', /기권/);
});

test('group result returns null for missing current standing or empty participants', () => {
  assert.equal(buildGroupMatchFinishModel({
    currentStanding: null,
    participantCount: 2,
    standings: [],
    currentPaceLabel: '--:--/km',
    currentElapsedSeconds: 0,
    targetDistanceKm: 5,
  }), null);

  assert.equal(buildGroupMatchFinishModel({
    currentStanding: standing(),
    participantCount: 0,
    standings: [standing()],
    currentPaceLabel: '--:--/km',
    currentElapsedSeconds: 0,
    targetDistanceKm: 5,
  }), null);
});
