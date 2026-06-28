import assert from 'node:assert/strict';
import test from 'node:test';
import type { DuelMatchOpponent, DuelVerdict, GroupVerdict } from '@/lib/api/types';
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
  assert.equal(result?.matchResult.opponentId, 'opponent');
  assert.equal(result?.matchResult.opponentName, '상대');
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

test('duel result uses official finish order when both runners finish at the same distance', () => {
  const currentUserFirst = buildDuelMatchFinishModel({
    opponent: opponent({
      officialReady: true,
      officialDistanceKm: 1,
      officialElapsedSeconds: 610,
      officialAveragePace: '10:10/km',
      officialRank: 2,
      liveStatus: 'finished',
    }),
    currentDistanceKm: 1,
    targetDistanceKm: 1,
    currentElapsedSeconds: 600,
    currentPaceLabel: '10:00/km',
    currentUserLiveStatus: 'finished',
  });

  assert.equal(currentUserFirst?.matchResult.resultTone, 'win');
  assert.equal(currentUserFirst?.matchResult.badgeLabel, '승리');
  assert.equal(currentUserFirst?.matchResult.gapKm, 0);
  assert.deepEqual(currentUserFirst?.rows.map((row) => row.resultLabel), ['WIN', 'LOSER']);

  const opponentFirst = buildDuelMatchFinishModel({
    opponent: opponent({
      officialReady: true,
      officialDistanceKm: 1,
      officialElapsedSeconds: 590,
      officialAveragePace: '09:50/km',
      officialRank: 1,
      liveStatus: 'finished',
    }),
    currentDistanceKm: 1,
    targetDistanceKm: 1,
    currentElapsedSeconds: 600,
    currentPaceLabel: '10:00/km',
    currentUserLiveStatus: 'finished',
  });

  assert.equal(opponentFirst?.matchResult.resultTone, 'lose');
  assert.equal(opponentFirst?.matchResult.badgeLabel, '패배');
  assert.equal(opponentFirst?.matchResult.gapKm, 0);
  assert.deepEqual(opponentFirst?.rows.map((row) => row.resultLabel), ['WIN', 'LOSER']);
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

function groupVerdict(overrides: Partial<GroupVerdict> = {}): GroupVerdict {
  return {
    resolved: true,
    myRank: 2,
    participants: [
      { userId: 'leader', rank: 1, finishElapsedSeconds: 1500, paceLabel: '05:00/km', forfeited: false, finished: true },
      { userId: 'me', rank: 2, finishElapsedSeconds: 1560, paceLabel: '05:12/km', forfeited: false, finished: true },
      { userId: 'third', rank: 3, finishElapsedSeconds: 1620, paceLabel: '05:24/km', forfeited: false, finished: true },
    ],
    ...overrides,
  };
}

test('group parity: a RESOLVED groupVerdict drives the persisted server placement (not the local standings rank)', () => {
  // The local standings would call this 3위 (currentStanding.rank), but the server verdict
  // sealed 2위 — the server is the single source of truth.
  const standings = [
    standing({ id: 'leader', name: '1등', rank: 1, currentDistanceKm: 2.2, liveStatus: 'finished' }),
    standing({ id: 'me', name: '나', rank: 3, currentDistanceKm: 2, isCurrentUser: true, liveStatus: 'finished' }),
    standing({ id: 'third', name: '3등', rank: 2, currentDistanceKm: 1.7, liveStatus: 'finished' }),
  ];

  const result = buildGroupMatchFinishModel({
    currentStanding: standings[1],
    participantCount: 3,
    standings,
    currentPaceLabel: '05:12/km',
    currentElapsedSeconds: 1560,
    targetDistanceKm: 5,
    groupVerdict: groupVerdict({ myRank: 2 }),
    matchId: 'group-123',
  });

  assert.equal(result?.matchResult.rank, 2);
  assert.equal(result?.matchResult.badgeLabel, '2위');
  assert.match(result?.matchResult.title ?? '', /2위/);
  assert.equal(result?.matchResult.participantCount, 3);
});

test('group parity: a real match (matchId present) with an UNRESOLVED verdict + an in-progress rival is PENDING, not a fabricated rank', () => {
  // The screen-off "wrong placement" input: the current user finished 1st locally, but a rival
  // is still running and there is no server verdict yet. With matchId present this must be
  // PENDING — never a persisted local rank (which the backend would award rank LP for).
  const standings = [
    standing({ id: 'me', name: '나', rank: 1, currentDistanceKm: 5, isCurrentUser: true, liveStatus: 'finished' }),
    standing({ id: 'rival', name: '상대', rank: 2, currentDistanceKm: 3, liveStatus: 'running' }),
  ];

  const result = buildGroupMatchFinishModel({
    currentStanding: standings[0],
    participantCount: 2,
    standings,
    currentPaceLabel: '05:00/km',
    currentElapsedSeconds: 1500,
    targetDistanceKm: 5,
    groupVerdict: null,
    matchId: 'group-123',
  });

  // No rank persisted → the backend awards no rank LP and the saved card shows "결과 집계 중".
  assert.equal(result?.matchResult.rank, undefined);
  assert.equal(result?.matchResult.badgeLabel, '결과 집계 중');
  assert.match(result?.title ?? '', /집계/);
});

test('group parity: a real match whose participants are ALL terminal but with NO server verdict is NOT pending (graceful — no fabricated wait)', () => {
  // Every participant is finished/forfeited locally, so there is no ongoing rival to wait on.
  // An older backend (no groupVerdict) must still resolve to the local standings rank rather
  // than hang on PENDING forever.
  const standings = [
    standing({ id: 'leader', name: '1등', rank: 1, currentDistanceKm: 2.2, liveStatus: 'finished' }),
    standing({ id: 'me', name: '나', rank: 2, currentDistanceKm: 2, isCurrentUser: true, liveStatus: 'finished' }),
  ];

  const result = buildGroupMatchFinishModel({
    currentStanding: standings[1],
    participantCount: 2,
    standings,
    currentPaceLabel: '05:12/km',
    currentElapsedSeconds: 1560,
    targetDistanceKm: 5,
    groupVerdict: null,
    matchId: 'group-123',
  });

  assert.equal(result?.matchResult.badgeLabel, '2위');
  assert.equal(result?.matchResult.rank, 2);
});

test('group parity: WITHOUT a matchId (legacy local-only group) the local standings rank is kept (no regression)', () => {
  // Same in-progress-rival input as the PENDING test, but no matchId → a synthetic/legacy group
  // with no server session → keep today's local behavior (persist the local standings rank).
  const standings = [
    standing({ id: 'me', name: '나', rank: 1, currentDistanceKm: 5, isCurrentUser: true, liveStatus: 'finished' }),
    standing({ id: 'rival', name: '상대', rank: 2, currentDistanceKm: 3, liveStatus: 'running' }),
  ];

  const result = buildGroupMatchFinishModel({
    currentStanding: standings[0],
    participantCount: 2,
    standings,
    currentPaceLabel: '05:00/km',
    currentElapsedSeconds: 1500,
    targetDistanceKm: 5,
    // No matchId, no verdict — pure legacy local path.
  });

  assert.equal(result?.matchResult.rank, 1);
  assert.equal(result?.matchResult.badgeLabel, '1위');
});

test('group parity: a forfeit on a real match keeps the 기권 badge even while the verdict is unresolved', () => {
  const standings = [
    standing({ id: 'leader', name: '1등', rank: 1, currentDistanceKm: 2.2, liveStatus: 'finished' }),
    standing({
      id: 'me',
      name: '나',
      rank: 2,
      currentDistanceKm: 1.1,
      isCurrentUser: true,
      isForfeited: true,
      liveStatus: 'forfeited',
    }),
  ];

  const result = buildGroupMatchFinishModel({
    currentStanding: standings[1],
    participantCount: 2,
    standings,
    currentPaceLabel: '06:10/km',
    currentElapsedSeconds: 420,
    targetDistanceKm: 5,
    groupVerdict: null,
    matchId: 'group-123',
  });

  assert.equal(result?.matchResult.badgeLabel, '기권');
  assert.match(result?.matchResult.title ?? '', /기권/);
});

test('duel matchResult persists the opponent\'s own measured pace and synced duration', () => {
  const result = buildDuelMatchFinishModel({
    opponent: opponent({
      liveDistanceKm: 3.1,
      liveElapsedSeconds: 1200,
      livePace: '06:27/km',
      liveStatus: 'running',
    }),
    currentDistanceKm: 5,
    targetDistanceKm: 5,
    currentElapsedSeconds: 1500,
    currentPaceLabel: '05:00/km',
    currentUserLiveStatus: 'finished',
  });

  assert.equal(result?.matchResult.opponentPaceLabel, '06:27/km');
  assert.equal(result?.matchResult.opponentDurationSeconds, 1200);
});

function verdict(overrides: Partial<DuelVerdict> = {}): DuelVerdict {
  return {
    resolved: true,
    winnerUserId: 'me-user',
    outcome: 'win',
    myFinishElapsedSeconds: 1500,
    opponentFinishElapsedSeconds: 1560,
    myPaceLabel: '5:00/km',
    opponentPaceLabel: '5:12/km',
    ...overrides,
  };
}

test('C2: resolved duelVerdict drives win/lose verdict and uses server finish times + paces', () => {
  // Local distance compare would call this a LOSS (opponent distance ahead), but the server
  // verdict resolved to a WIN — the server is the single source of truth.
  const result = buildDuelMatchFinishModel({
    opponent: opponent({
      officialReady: true,
      officialDistanceKm: 1.4,
      officialElapsedSeconds: 1560,
      officialAveragePace: '07:09/km',
      officialRank: 1,
      liveStatus: 'finished',
    }),
    currentDistanceKm: 1.1,
    targetDistanceKm: 5,
    // Local frozen self time/pace are placeholders that must be overridden by the server.
    currentElapsedSeconds: 999,
    currentPaceLabel: '06:14/km',
    currentUserLiveStatus: 'finished',
    duelVerdict: verdict({ outcome: 'win', myFinishElapsedSeconds: 1500, myPaceLabel: '5:00/km' }),
    currentUserFinishElapsedSeconds: 1234,
  });

  assert.equal(result?.matchResult.resultTone, 'win');
  assert.equal(result?.matchResult.badgeLabel, '승리');
  // Self row + persisted matchResult use the server finish time/pace, NOT the local 999/6:14.
  const myRow = result?.rows.find((row) => row.isCurrentUser);
  assert.equal(myRow?.durationLabel, '25:00');
  assert.equal(myRow?.paceLabel, '5:00/km');
  assert.equal(result?.matchResult.myDurationSeconds, 1500);
  assert.equal(result?.matchResult.myPaceLabel, '5:00/km');
  // Opponent row + persisted matchResult use the server opponent finish time/pace.
  const opponentRow = result?.rows.find((row) => !row.isCurrentUser);
  assert.equal(opponentRow?.durationLabel, '26:00');
  assert.equal(opponentRow?.paceLabel, '5:12/km');
  assert.equal(result?.matchResult.opponentDurationSeconds, 1560);
  assert.equal(result?.matchResult.opponentPaceLabel, '5:12/km');
});

test('C2: resolved duelVerdict draw overrides the local distance compare', () => {
  const result = buildDuelMatchFinishModel({
    opponent: opponent({
      officialReady: true,
      officialDistanceKm: 1.4,
      officialElapsedSeconds: 1500,
      officialAveragePace: '07:09/km',
      officialRank: 1,
      liveStatus: 'finished',
    }),
    currentDistanceKm: 1.0,
    targetDistanceKm: 5,
    currentElapsedSeconds: 1500,
    currentPaceLabel: '05:00/km',
    currentUserLiveStatus: 'finished',
    duelVerdict: verdict({ outcome: 'draw', winnerUserId: null }),
  });

  assert.equal(result?.matchResult.resultTone, 'draw');
  assert.equal(result?.matchResult.badgeLabel, '무승부');
  assert.deepEqual(result?.rows.map((row) => row.resultLabel), ['DRAW', 'DRAW']);
});

test('C2: absent duelVerdict falls back to local distance-based verdict', () => {
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
    // No duelVerdict — older backend. Must behave exactly as today: local distance compare.
    duelVerdict: null,
  });

  assert.equal(result?.matchResult.resultTone, 'win');
  assert.equal(result?.matchResult.comparedDistanceKm, 1.1);
  // Self time stays the local frozen value (no server override available).
  assert.equal(result?.matchResult.myDurationSeconds, 600);
  assert.equal(result?.matchResult.myPaceLabel, '08:00/km');
});

test('C1: a real match (matchId present) with an unresolved verdict and a screen-off opponent is PENDING, not a distance-based win', () => {
  // The screen-off "always win" input: the current user finished, the opponent is locally marked
  // finished but their progress NEVER synced (no officialRank, no live distance → opponentDistanceKm
  // falls to 0) and there is no server verdict yet. The old code's distance compare returned 'win'
  // here on BOTH phones. With matchId present this must be PENDING instead.
  const result = buildDuelMatchFinishModel({
    opponent: opponent({ liveStatus: 'finished' }),
    currentDistanceKm: 5,
    targetDistanceKm: 5,
    currentElapsedSeconds: 1500,
    currentPaceLabel: '05:00/km',
    currentUserLiveStatus: 'finished',
    duelVerdict: null,
    matchId: 'match-123',
  });

  // No definite tone is persisted → the backend awards no +20P and the saved card shows the
  // "결과 집계 중" state; the reconcile path fills the official verdict later.
  assert.equal(result?.matchResult.resultTone, undefined);
  assert.equal(result?.matchResult.badgeLabel, '결과 집계 중');
  assert.equal(result?.matchResult.gapKm, undefined);
  assert.equal(result?.matchResult.opponentDurationSeconds, undefined);
  // The current user's own measured pace/time are still persisted (they are real).
  assert.equal(result?.matchResult.myDurationSeconds, 1500);
  assert.equal(result?.matchResult.myPaceLabel, '05:00/km');
});

test('C1: the SAME inputs WITHOUT a matchId keep the legacy local distance-based win (no regression)', () => {
  // Identical to the test above but with no matchId — a synthetic/legacy local-only duel that
  // never had a server session. The old local heuristic must be preserved exactly.
  const result = buildDuelMatchFinishModel({
    opponent: opponent({ liveStatus: 'finished' }),
    currentDistanceKm: 5,
    targetDistanceKm: 5,
    currentElapsedSeconds: 1500,
    currentPaceLabel: '05:00/km',
    currentUserLiveStatus: 'finished',
    duelVerdict: null,
  });

  assert.equal(result?.matchResult.resultTone, 'win');
  assert.equal(result?.matchResult.badgeLabel, '승리');
});

test('C1: a resolved verdict on a real match still produces the definite win (pending only applies while unresolved)', () => {
  const result = buildDuelMatchFinishModel({
    opponent: opponent({ officialReady: true, officialRank: 2, liveStatus: 'finished' }),
    currentDistanceKm: 5,
    targetDistanceKm: 5,
    currentElapsedSeconds: 1500,
    currentPaceLabel: '05:00/km',
    currentUserLiveStatus: 'finished',
    duelVerdict: verdict({ outcome: 'win', myFinishElapsedSeconds: 1500, myPaceLabel: '5:00/km' }),
    matchId: 'match-123',
  });

  assert.equal(result?.matchResult.resultTone, 'win');
  assert.equal(result?.matchResult.badgeLabel, '승리');
});

test('C2: pending duelVerdict (resolved=false) does not flip to a final verdict', () => {
  const result = buildDuelMatchFinishModel({
    opponent: opponent({ liveStatus: 'running' }),
    currentDistanceKm: 5,
    targetDistanceKm: 5,
    currentElapsedSeconds: 1500,
    currentPaceLabel: '05:00/km',
    currentUserLiveStatus: 'finished',
    duelVerdict: {
      resolved: false,
      winnerUserId: null,
      outcome: 'pending',
      myFinishElapsedSeconds: 1500,
      opponentFinishElapsedSeconds: null,
      myPaceLabel: '5:00/km',
      opponentPaceLabel: null,
    },
  });

  // Opponent still running → the progressive in-progress placeholder, not a fabricated result.
  const opponentRow = result?.rows.find((row) => !row.isCurrentUser);
  assert.equal(opponentRow?.resultLabel, 'ING');
  assert.equal(opponentRow?.isInProgress, true);
});

test('C2: forfeit result card still shows 기권 even with a resolved verdict', () => {
  const result = buildDuelMatchFinishModel({
    opponent: opponent({ liveDistanceKm: 0.6, liveStatus: 'running' }),
    currentDistanceKm: 1.2,
    targetDistanceKm: 5,
    currentElapsedSeconds: 360,
    currentPaceLabel: '05:00/km',
    currentUserLiveStatus: 'forfeited',
    duelVerdict: verdict({ outcome: 'lose', winnerUserId: 'opponent', myFinishElapsedSeconds: null, myPaceLabel: null }),
  });

  assert.equal(result?.matchResult.resultTone, 'lose');
  assert.equal(result?.matchResult.badgeLabel, '기권 패');
  const myRow = result?.rows.find((row) => row.isCurrentUser);
  assert.equal(myRow?.resultLabel, 'FORFEIT');
});

test('C4: single pace source — 나 column pace equals persisted myPaceLabel from the verdict', () => {
  const result = buildDuelMatchFinishModel({
    opponent: opponent({
      officialReady: true,
      officialDistanceKm: 1.1,
      officialElapsedSeconds: 1560,
      officialAveragePace: '07:09/km',
      officialRank: 2,
      liveStatus: 'finished',
    }),
    currentDistanceKm: 1.25,
    targetDistanceKm: 5,
    // Local pace 6:14 must NOT win — the server verdict pace 6:17 is the single source.
    currentElapsedSeconds: 1499,
    currentPaceLabel: '06:14/km',
    currentUserLiveStatus: 'finished',
    duelVerdict: verdict({ outcome: 'win', myFinishElapsedSeconds: 1577, myPaceLabel: '6:17/km' }),
  });

  const myRow = result?.rows.find((row) => row.isCurrentUser);
  assert.equal(myRow?.paceLabel, '6:17/km');
  assert.equal(result?.matchResult.myPaceLabel, '6:17/km');
  assert.equal(result?.matchResult.myDurationSeconds, 1577);
});

test('duel matchResult omits opponent pace/time when their live progress never synced', () => {
  const result = buildDuelMatchFinishModel({
    // No liveDistanceKm / liveElapsedSeconds / livePace → their progress never arrived.
    opponent: opponent({ liveStatus: 'running' }),
    currentDistanceKm: 5,
    targetDistanceKm: 5,
    currentElapsedSeconds: 1500,
    currentPaceLabel: '05:00/km',
    currentUserLiveStatus: 'finished',
  });

  // Persist nothing for the opponent rather than a '--:--/km' placeholder or the current
  // user's own elapsed (1500) masquerading as the opponent's time.
  assert.equal(result?.matchResult.opponentPaceLabel, undefined);
  assert.equal(result?.matchResult.opponentDurationSeconds, undefined);
});
