import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  DuelMatchOpponent,
  GroupMatchParticipant,
  RunningMatchRoom,
  RunningMatchStatusResponse,
} from '@/lib/api/types';
import {
  buildCurrentUserLiveStatusModel,
  buildDuelProgressDisplayModel,
  hasAnyLiveMatchRemoteDisplayProgress,
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
    locallyForfeitedMatchIds: new Set(),
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
    locallyForfeitedMatchIds: new Set(['party-duel-match']),
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
    locallyForfeitedMatchIds: new Set(['other-match']),
    activeMatchId: 'party-duel-match',
  }).currentUserHasForfeitedActiveMatch, false);
});
