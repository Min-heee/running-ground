import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  DuelMatchOpponent,
  GroupMatchParticipant,
  RunningMatchRoom,
  RunningMatchStatusResponse,
} from '@/lib/api/types';
import {
  applyDuelOpponentForfeitLatch,
  buildCurrentUserLiveStatusModel,
  buildDuelProgressDisplayModel,
  hasAnyLiveMatchRemoteDisplayProgress,
  resolveDuelOpponentForfeitLatch,
  resolveActiveDuelArenaMatchId,
  selectSyncedDuelProgress,
} from './liveMatchProgressModel';

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

function buildStatus(overrides: Partial<RunningMatchStatusResponse>): RunningMatchStatusResponse {
  return {
    success: true,
    mode: 'duel',
    state: 'active',
    matchId: 'match-1',
    distanceKm: 5,
    slotStartAt: '2026-05-15T00:00:00.000Z',
    slotLabel: '테스트',
    paceBandLabel: '테스트',
    levelBandLabel: '테스트',
    criteriaSummary: '테스트',
    estimatedWaitMinutes: 0,
    participantCount: 2,
    acceptedCount: 2,
    capacity: 2,
    userAccepted: true,
    readyToStart: true,
    ...overrides,
  };
}

function buildRoom(overrides: Partial<RunningMatchRoom>): RunningMatchRoom {
  return {
    roomId: 'room-1',
    inviteToken: 'ABC123',
    inviteLink: 'https://running-ground.test/invite/ABC123',
    mode: 'duel',
    state: 'active',
    startMode: 'host',
    distanceKm: 5,
    slotStartAt: '2026-05-15T00:00:00.000Z',
    slotLabel: '테스트',
    maxParticipants: 2,
    minParticipants: 2,
    canStart: false,
    isHost: true,
    hostUserId: 'user-1',
    hostName: '호스트',
    participants: [],
    invitedFriendIds: [],
    ...overrides,
  };
}

function buildGroupParticipant(overrides: Partial<GroupMatchParticipant>): GroupMatchParticipant {
  return {
    id: 'runner-1',
    name: '러너',
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

test('resolveActiveDuelArenaMatchId prefers live status and falls back to linked room state', () => {
  assert.equal(resolveActiveDuelArenaMatchId({
    matchMode: 'duel',
    duelMatchStatus: buildStatus({ matchId: 'status-match' }),
    visibleMatchRoom: buildRoom({ linkedMatchId: 'room-match' }),
  }), 'status-match');

  assert.equal(resolveActiveDuelArenaMatchId({
    matchMode: 'duel',
    duelMatchStatus: null,
    visibleMatchRoom: buildRoom({ linkedMatchId: 'room-match' }),
  }), 'room-match');

  assert.equal(resolveActiveDuelArenaMatchId({
    matchMode: 'group',
    duelMatchStatus: buildStatus({ matchId: 'status-match' }),
    visibleMatchRoom: buildRoom({ linkedMatchId: 'room-match' }),
  }), null);
});

test('selectSyncedDuelProgress only returns progress for the active duel match', () => {
  const progress = {
    matchId: 'match-1',
    distanceKm: 1.2,
    elapsedSeconds: 420,
    currentPace: '05:50/km',
    updatedAt: 1,
  };

  assert.equal(selectSyncedDuelProgress({
    activeDuelArenaMatchId: 'match-1',
    lastSyncedMatchProgress: progress,
  }), progress);
  assert.equal(selectSyncedDuelProgress({
    activeDuelArenaMatchId: 'match-2',
    lastSyncedMatchProgress: progress,
  }), null);
});

test('buildDuelProgressDisplayModel prefers official comparison when both runners are ready', () => {
  const model = buildDuelProgressDisplayModel({
    duelMatchStatus: buildStatus({
      officialComparison: {
        comparedAt: '2026-05-15T00:01:00.000Z',
        elapsedSeconds: 600,
        participantCount: 2,
        readyParticipantCount: 2,
        userDistanceKm: 1.4,
      },
    }),
    syncedDuelProgress: null,
    effectiveDuelOpponent: {
      ...baseOpponent,
      officialReady: true,
      officialDistanceKm: 1.1,
      officialElapsedSeconds: 600,
      officialAveragePace: '09:05/km',
    },
    duelDistanceKm: 5,
    distanceKm: 0.8,
  });

  assert.equal(model.officialDuelReady, true);
  assert.deepEqual(model.duelComparisonSnapshot, {
    checkpointSeconds: 600,
    currentDistanceKm: 1.4,
    opponentDistanceKm: 1.1,
    gapKm: 0.3,
  });
  assert.equal(model.syncedDuelDistanceKm, 1.4);
  assert.equal(model.syncedDuelOpponentDistanceKm, 1.1);
});

test('buildDuelProgressDisplayModel keeps survivor distance live after opponent finishes', () => {
  const model = buildDuelProgressDisplayModel({
    duelMatchStatus: buildStatus({
      currentUserLiveStatus: 'running',
      officialComparison: {
        comparedAt: '2026-05-15T00:01:00.000Z',
        elapsedSeconds: 900,
        participantCount: 2,
        readyParticipantCount: 2,
        userDistanceKm: 1.4,
      },
    }),
    syncedDuelProgress: null,
    effectiveDuelOpponent: {
      ...baseOpponent,
      liveStatus: 'finished',
      officialReady: true,
      officialDistanceKm: 5,
      officialElapsedSeconds: 900,
      officialAveragePace: '05:00/km',
    },
    duelDistanceKm: 5,
    distanceKm: 3.2,
  });

  assert.equal(model.officialDuelReady, true);
  assert.equal(model.syncedDuelDistanceKm, 3.2);
  assert.equal(model.syncedDuelOpponentDistanceKm, 5);
  assert.equal(model.duelComparisonSnapshot?.gapKm, -1.8);
});

test('buildDuelProgressDisplayModel: pre-sync (no comparison, no opponent progress) shows my live distance not a fake 0', () => {
  // EDGE CASE: opponent has no checkpoint yet at match start and the server has not sent an
  // official comparison. My head-to-head dot now reads syncedDuelDistanceKm — which MUST
  // fall back to my live `distanceKm`, never 0, so I do not appear far ahead of a 0.00 rival.
  const model = buildDuelProgressDisplayModel({
    duelMatchStatus: buildStatus({}),
    syncedDuelProgress: null,
    effectiveDuelOpponent: { ...baseOpponent },
    duelDistanceKm: 5,
    distanceKm: 0.35,
  });

  assert.equal(model.officialDuelReady, false);
  assert.equal(model.duelComparisonSnapshot, null);
  // My synced dot distance falls back to my live 0.35 (NOT 0) — no fake head start.
  assert.equal(model.syncedDuelDistanceKm, 0.35);
  // Opponent has no progress at all → its display distance is 0 and there is no phantom gap
  // (duelLiveGapKm stays null so the footer shows the '동기화 중' / not-ready presentation).
  assert.equal(model.syncedDuelOpponentDistanceKm, 0);
  assert.equal(model.duelLiveGapKm, null);
});

test('buildDuelProgressDisplayModel: fallback comparison buckets both runners at the 10s common checkpoint', () => {
  // Before the official comparison is ready, buildDuelComparisonSnapshot supplies a fallback
  // snapshot. With the client checkpoint step tightened to 10s, a common elapsed of 27s
  // buckets to the 20s checkpoint (not 30s), aligning the fallback with the backend grid.
  const model = buildDuelProgressDisplayModel({
    duelMatchStatus: buildStatus({}),
    syncedDuelProgress: {
      matchId: 'match-1',
      distanceKm: 0.9,
      elapsedSeconds: 27,
      currentPace: '05:00/km',
      updatedAt: 1,
    },
    effectiveDuelOpponent: {
      ...baseOpponent,
      liveDistanceKm: 0.8,
      liveElapsedSeconds: 27,
      liveUpdatedAt: '2026-05-15T00:00:27.000Z',
    },
    duelDistanceKm: 5,
    distanceKm: 0.9,
  });

  assert.equal(model.officialDuelReady, false);
  // 27s common elapsed → floor to the 20s checkpoint under the 10s step (was 0s under 30s,
  // which produced no fallback snapshot at all this early).
  assert.equal(model.duelComparisonSnapshot?.checkpointSeconds, 20);
});

test('remote progress selector separates duel and group progress checks', () => {
  assert.equal(hasAnyLiveMatchRemoteDisplayProgress({
    matchMode: 'duel',
    hasDuelOpponentDisplayProgress: true,
    effectiveGroupParticipants: [],
  }), true);

  assert.equal(hasAnyLiveMatchRemoteDisplayProgress({
    matchMode: 'group',
    hasDuelOpponentDisplayProgress: false,
    effectiveGroupParticipants: [
      buildGroupParticipant({ id: 'idle' }),
      buildGroupParticipant({ id: 'progress', liveDistanceKm: 0.5 }),
    ],
  }), true);
});

test('current user live status model keeps group fallback status stable', () => {
  assert.deepEqual(buildCurrentUserLiveStatusModel({
    matchMode: 'group',
    duelMatchStatus: null,
    groupMatchStatus: null,
    currentGroupLiveStatus: 'forfeited',
    locallyForfeitedMatches: new Map(),
    activeMatchId: null,
  }), {
    currentUserDuelLiveStatus: null,
    currentUserGroupLiveStatus: 'forfeited',
    currentUserHasForfeitedActiveMatch: true,
  });
});

test('current user live status model treats locally forfeited party-run match as forfeited', () => {
  assert.deepEqual(buildCurrentUserLiveStatusModel({
    matchMode: 'duel',
    duelMatchStatus: null,
    groupMatchStatus: null,
    currentGroupLiveStatus: null,
    locallyForfeitedMatches: new Map([['party-duel-match', {
      matchId: 'party-duel-match',
      forfeitedAt: 1,
      elapsedSeconds: 60,
      distanceKm: 0.2,
      paceLabel: '05:00/km',
    }]]),
    activeMatchId: 'party-duel-match',
  }), {
    currentUserDuelLiveStatus: null,
    currentUserGroupLiveStatus: null,
    currentUserHasForfeitedActiveMatch: true,
  });

  assert.equal(buildCurrentUserLiveStatusModel({
    matchMode: 'duel',
    duelMatchStatus: null,
    groupMatchStatus: null,
    currentGroupLiveStatus: null,
    locallyForfeitedMatches: new Map([['other-match', {
      matchId: 'other-match',
      forfeitedAt: 1,
      elapsedSeconds: 60,
      distanceKm: 0.2,
      paceLabel: '05:00/km',
    }]]),
    activeMatchId: 'party-duel-match',
  }).currentUserHasForfeitedActiveMatch, false);
});

test('duel opponent forfeit latch keeps ready fallback from hiding a received forfeit', () => {
  const forfeitLatch = resolveDuelOpponentForfeitLatch({
    activeMatchId: 'match-1',
    matchMode: 'duel',
    opponent: {
      ...baseOpponent,
      liveStatus: 'forfeited',
      liveUpdatedAt: '2026-05-15T00:01:00.000Z',
    },
    previousLatch: null,
  });

  assert.equal(forfeitLatch?.opponent.liveStatus, 'forfeited');

  const nextLatch = resolveDuelOpponentForfeitLatch({
    activeMatchId: 'match-1',
    matchMode: 'duel',
    opponent: {
      ...baseOpponent,
      liveStatus: 'ready',
      liveUpdatedAt: '2026-05-15T00:01:05.000Z',
    },
    previousLatch: forfeitLatch,
  });
  const latchedOpponent = applyDuelOpponentForfeitLatch({
    ...baseOpponent,
    liveStatus: 'ready',
    liveUpdatedAt: '2026-05-15T00:01:05.000Z',
  }, nextLatch);

  assert.equal(nextLatch, forfeitLatch);
  assert.equal(latchedOpponent?.liveStatus, 'forfeited');
});

test('duel opponent forfeit latch resets for a different match', () => {
  const forfeitLatch = resolveDuelOpponentForfeitLatch({
    activeMatchId: 'match-1',
    matchMode: 'duel',
    opponent: {
      ...baseOpponent,
      liveStatus: 'forfeited',
    },
    previousLatch: null,
  });

  assert.equal(resolveDuelOpponentForfeitLatch({
    activeMatchId: 'match-2',
    matchMode: 'duel',
    opponent: {
      ...baseOpponent,
      liveStatus: 'ready',
    },
    previousLatch: forfeitLatch,
  }), null);
});
