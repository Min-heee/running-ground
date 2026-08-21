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
import { __resetOfficialCheckpointStalenessForTest } from './officialCheckpointStaleness';

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

test('CHECKPOINT STALE-FALLBACK: a pinned official checkpoint degrades to the raw comparison and recovers on advance', () => {
  __resetOfficialCheckpointStalenessForTest();
  const T0 = Date.parse('2026-07-10T00:00:00.000Z');
  const buildInput = (elapsedSeconds: number, opponentLiveKm: number, nowMs: number) => ({
    duelMatchStatus: buildStatus({
      officialComparison: {
        comparedAt: '2026-07-10T00:01:00.000Z',
        elapsedSeconds,
        participantCount: 2,
        readyParticipantCount: 2,
        userDistanceKm: 1.0,
      },
    }),
    syncedDuelProgress: null,
    effectiveDuelOpponent: {
      ...baseOpponent,
      liveStatus: 'running' as const,
      liveDistanceKm: opponentLiveKm,
      officialReady: true,
      officialDistanceKm: 0.9,
      officialElapsedSeconds: elapsedSeconds,
      officialAveragePace: '09:05/km',
    },
    duelDistanceKm: 5,
    distanceKm: 1.2,
  });

  // Fresh checkpoint → official comparison wins.
  const fresh = buildDuelProgressDisplayModel({ ...buildInput(600, 1.05, T0), nowMs: T0 });
  assert.equal(fresh.officialDuelReady, true);
  assert.equal(fresh.syncedDuelOpponentDistanceKm, 0.9);

  // Same checkpoint 10s later — still inside the stall window, official still wins.
  const inside = buildDuelProgressDisplayModel({ ...buildInput(600, 1.1, T0 + 10_000), nowMs: T0 + 10_000 });
  assert.equal(inside.officialDuelReady, true);

  // Same checkpoint past the stall window → degrade to the raw last-received comparison so
  // the display keeps living while transport is degraded (footer drops '서버 공식').
  const stale = buildDuelProgressDisplayModel({ ...buildInput(600, 1.15, T0 + 16_000), nowMs: T0 + 16_000 });
  assert.equal(stale.officialDuelReady, false);

  // The checkpoint ADVANCES → fairness comparison resumes immediately.
  const recovered = buildDuelProgressDisplayModel({ ...buildInput(610, 1.2, T0 + 17_000), nowMs: T0 + 17_000 });
  assert.equal(recovered.officialDuelReady, true);
  assert.equal(recovered.syncedDuelOpponentDistanceKm, 0.9);

  __resetOfficialCheckpointStalenessForTest();
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

test('내 행 거리는 내가 뛴 거리 아래로 내려가지 않는다 — 간격은 서버 기준 그대로', () => {
  // 8/21 파티런 회귀 못: 화면을 깨우면 내 기록(5.61km)보다 레이스보드의 내 행(5.28km)이
  // 0.3~0.4km 뒤처져 보이던 증상. 공식 비교값은 두 사람이 공유하는 '같은 경과'로 되돌린
  // 값이라, 상대(또는 잠들어 있던 내) 통신이 조용한 만큼 내 숫자가 비례로 깎였다.
  // 내 행만 실제 거리로 바닥을 깔고, 상대 거리와 간격은 서버 기준을 지킨다.
  const model = buildDuelProgressDisplayModel({
    duelMatchStatus: buildStatus({
      officialComparison: {
        comparedAt: '2026-05-15T00:30:00.000Z',
        elapsedSeconds: 1800,
        participantCount: 2,
        readyParticipantCount: 2,
        // 공유 경과가 90초 밀려 내 거리가 깎인 상태.
        userDistanceKm: 5.28,
      },
    }),
    syncedDuelProgress: null,
    effectiveDuelOpponent: {
      ...baseOpponent,
      officialReady: true,
      officialDistanceKm: 5.2,
      officialElapsedSeconds: 1800,
      officialAveragePace: '05:46/km',
    },
    duelDistanceKm: 7,
    // 내 기록이 실제로 도달한 거리.
    distanceKm: 5.61,
  });

  assert.equal(model.syncedDuelDistanceKm, 5.61, '내 행이 내 기록보다 뒤처졌다');
  assert.equal(model.syncedDuelOpponentDistanceKm, 5.2, '상대 거리는 서버 기준 그대로여야 한다');
  assert.equal(model.duelLiveGapKm, 0.08, '간격은 서버 공식 비교값 그대로여야 한다');
});
