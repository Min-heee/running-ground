import assert from 'node:assert/strict';
import test from 'node:test';
import type { ArenaParticipantViewModel } from '@/features/runs/viewModels/matchViewModels';
import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';
import {
  isRunningMatchForceResetCandidate,
  resolveActiveLiveMatchProgressMatchId,
  resolveActiveMatchExitAllOthersForfeited,
  resolveCurrentUserArenaPace,
  resolveDuelLiveSummary,
  resolveRoomLinkedDuelProgress,
  resolveTrackRunRuntimeRouteHydration,
} from './trackRunRuntimeDerivedState';

test('resolveActiveMatchExitAllOthersForfeited is true only when every other group runner is done and I am still active', () => {
  const otherDone: ArenaParticipantViewModel = {
    id: 'other',
    name: '상대',
    distanceKm: 1,
    paceLabel: '5:00/km',
    liveStatus: 'finished',
  };
  const otherActive: ArenaParticipantViewModel = {
    id: 'other-2',
    name: '상대2',
    distanceKm: 1,
    paceLabel: '5:00/km',
    liveStatus: 'running',
  };

  assert.equal(resolveActiveMatchExitAllOthersForfeited({
    activeMatchExitSource: 'duel',
    groupArenaParticipants: [otherDone],
    currentUserGroupLiveStatus: 'running',
    currentUserHasForfeitedActiveMatch: false,
  }), false);

  assert.equal(resolveActiveMatchExitAllOthersForfeited({
    activeMatchExitSource: 'group',
    groupArenaParticipants: [],
    currentUserGroupLiveStatus: 'running',
    currentUserHasForfeitedActiveMatch: false,
  }), false);

  assert.equal(resolveActiveMatchExitAllOthersForfeited({
    activeMatchExitSource: 'group',
    groupArenaParticipants: [otherDone, otherActive],
    currentUserGroupLiveStatus: 'running',
    currentUserHasForfeitedActiveMatch: false,
  }), false);

  assert.equal(resolveActiveMatchExitAllOthersForfeited({
    activeMatchExitSource: 'group',
    groupArenaParticipants: [otherDone],
    currentUserGroupLiveStatus: 'running',
    currentUserHasForfeitedActiveMatch: false,
  }), true);

  assert.equal(resolveActiveMatchExitAllOthersForfeited({
    activeMatchExitSource: 'group',
    groupArenaParticipants: [otherDone],
    currentUserGroupLiveStatus: 'finished',
    currentUserHasForfeitedActiveMatch: false,
  }), false);
});

test('isRunningMatchForceResetCandidate matches "already in room/match" messages', () => {
  assert.equal(isRunningMatchForceResetCandidate(null), false);
  assert.equal(isRunningMatchForceResetCandidate(''), false);
  assert.equal(isRunningMatchForceResetCandidate('이미 진행 중인 방이 있어요.'), true);
  assert.equal(isRunningMatchForceResetCandidate('이미 매칭 중이에요.'), true);
  assert.equal(isRunningMatchForceResetCandidate('이미 대결이 진행 중이에요.'), true);
  assert.equal(isRunningMatchForceResetCandidate('네트워크 오류가 발생했어요.'), false);
  assert.equal(isRunningMatchForceResetCandidate('이미 완료되었습니다.'), false);
});

test('resolveTrackRunRuntimeRouteHydration prefers explicit route props over hydrated route state', () => {
  const result = resolveTrackRunRuntimeRouteHydration({
    focusMatchMode: 'duel',
    focusMatchId: 'focus-match',
    focusMatchDistanceKm: 3,
    focusMatchSlotStartAt: '2026-05-19T11:00:00.000Z',
    focusMatchNonce: 'focus-nonce',
    forceMatchArena: true,
    focusRoomId: 'focus-room',
    liveMatchRouteHydration: {
      hydratedAtMs: Date.now(),
      matchId: 'hydrated-match',
      mode: 'duel',
      nonce: 'hydrated-nonce',
      preferArena: false,
      roomId: 'hydrated-room',
      distanceKm: 5,
      slotStartAt: '2026-05-19T12:00:00.000Z',
    },
  });

  assert.deepEqual(result, {
    hydratedFocusMatchMode: 'duel',
    hydratedFocusMatchId: 'focus-match',
    hydratedFocusRoomId: 'focus-room',
    hydratedFocusMatchDistanceKm: 3,
    hydratedFocusMatchSlotStartAt: '2026-05-19T11:00:00.000Z',
    hydratedForceMatchArena: true,
    hydratedFocusMatchNonce: 'focus-nonce',
  });
});

test('resolveTrackRunRuntimeRouteHydration uses hydrated match only for the selected mode', () => {
  const result = resolveTrackRunRuntimeRouteHydration({
    focusMatchMode: 'group',
    liveMatchRouteHydration: {
      hydratedAtMs: Date.now(),
      matchId: 'duel-match',
      mode: 'duel',
      nonce: 'hydrated-nonce',
      roomId: null,
    },
  });

  assert.equal(result.hydratedFocusMatchMode, 'group');
  assert.equal(result.hydratedFocusMatchId, undefined);
  assert.equal(result.hydratedFocusMatchNonce, 'hydrated-nonce');
});

test('resolveCurrentUserArenaPace keeps official pace before calculating display pace', () => {
  assert.equal(resolveCurrentUserArenaPace({
    officialCurrentAveragePace: '5:10/km',
    liveMatchDisplayDistanceKm: 0,
    liveMatchDisplayElapsedSeconds: 0,
    shouldUseLivePace: false,
  }), '5:10/km');

  assert.equal(resolveCurrentUserArenaPace({
    officialCurrentAveragePace: null,
    liveMatchDisplayDistanceKm: 1,
    liveMatchDisplayElapsedSeconds: 300,
    shouldUseLivePace: true,
  }), '05:00/km');
});

test('resolveCurrentUserArenaPace tracks the wall-clock elapsed so a screen-off run does not freeze the avg pace', () => {
  // RC-4: while backgrounded the slot-ticker elapsed freezes (e.g. 300s) but GPS keeps growing
  // distance. Feeding the frozen ticker elapsed would drift the pace; feeding the wall-clock
  // arena elapsed keeps it correct. Same distance, two elapsed inputs:
  const frozenTickerPace = resolveCurrentUserArenaPace({
    officialCurrentAveragePace: null,
    liveMatchDisplayDistanceKm: 1.5,
    liveMatchDisplayElapsedSeconds: 300, // frozen ticker — would read 03:20/km (too fast)
    shouldUseLivePace: true,
  });
  const wallClockPace = resolveCurrentUserArenaPace({
    officialCurrentAveragePace: null,
    liveMatchDisplayDistanceKm: 1.5,
    liveMatchDisplayElapsedSeconds: 450, // wall-clock elapsed kept advancing with the screen off
    shouldUseLivePace: true,
  });

  assert.equal(frozenTickerPace, '03:20/km');
  assert.equal(wallClockPace, '05:00/km');
  assert.notEqual(wallClockPace, frozenTickerPace);
});

test('resolveCurrentUserArenaPace shows the not-ready sentinel when MY distance is stale', () => {
  // Screen-off JS freeze: distance frozen low while elapsed climbs → cumulative pace balloons
  // (1290s / 1.65km ≈ 13:02/km). When flagged stale, show '--:--/km' instead of the lie.
  const stale = resolveCurrentUserArenaPace({
    officialCurrentAveragePace: null,
    liveMatchDisplayDistanceKm: 1.65,
    liveMatchDisplayElapsedSeconds: 1290,
    shouldUseLivePace: true,
    isMyDistanceStale: true,
  });
  assert.equal(stale, '--:--/km');
});

test('resolveCurrentUserArenaPace does NOT suppress a slow/walking-but-fresh pace', () => {
  // 13:00/km is a slow walk but the SAME numbers are a REAL pace when GPS is fresh (not stale):
  // it must render its true value, never the sentinel. The gate is staleness, not magnitude.
  const slowFresh = resolveCurrentUserArenaPace({
    officialCurrentAveragePace: null,
    liveMatchDisplayDistanceKm: 1.65,
    liveMatchDisplayElapsedSeconds: 1290,
    shouldUseLivePace: true,
    isMyDistanceStale: false,
  });
  assert.equal(slowFresh, '13:02/km');
});

test('resolveCurrentUserArenaPace keeps the server-authoritative official pace even when stale', () => {
  // Official pace comes from the server, not the frozen JS distance, so staleness must not hide it.
  assert.equal(resolveCurrentUserArenaPace({
    officialCurrentAveragePace: '5:10/km',
    liveMatchDisplayDistanceKm: 1.65,
    liveMatchDisplayElapsedSeconds: 1290,
    shouldUseLivePace: true,
    isMyDistanceStale: true,
  }), '5:10/km');
});

test('resolveDuelLiveSummary keeps opponent loading, forfeit, and status labels stable', () => {
  assert.equal(resolveDuelLiveSummary({
    opponent: null,
    opponentArenaPace: '',
    opponentStatusLabel: null,
    isOpponentForfeited: false,
  }), '상대 러너 정보를 불러오는 중이에요.');

  assert.equal(resolveDuelLiveSummary({
    opponent: { name: '민병희3' },
    opponentArenaPace: '5:20/km',
    opponentStatusLabel: '0.3km 앞',
    isOpponentForfeited: false,
  }), '민병희3님 · 5:20/km · 0.3km 앞');

  assert.equal(resolveDuelLiveSummary({
    opponent: { name: '민병희3' },
    opponentArenaPace: '5:20/km',
    opponentStatusLabel: '0.3km 앞',
    isOpponentForfeited: true,
  }), '민병희3님 · 기권');
});

test('resolveRoomLinkedDuelProgress separates current and opponent participants with gap', () => {
  const participants: ArenaParticipantViewModel[] = [
    {
      id: 'me',
      name: '나',
      paceLabel: '5:00/km',
      distanceKm: 1.24,
      isCurrentUser: true,
    },
    {
      id: 'opponent',
      name: '상대',
      paceLabel: '5:20/km',
      distanceKm: 1.01,
    },
  ];

  const result = resolveRoomLinkedDuelProgress(participants);

  assert.equal(result.roomLinkedDuelCurrentParticipant?.id, 'me');
  assert.equal(result.roomLinkedDuelOpponentParticipant?.id, 'opponent');
  assert.equal(result.roomLinkedDuelGapKm, 0.23);
  assert.equal(result.hasRoomLinkedDuelLiveProgress, true);
});

test('resolveActiveLiveMatchProgressMatchId selects by mode, falling back to the linked room context', () => {
  const duelLinkedContext: Pick<PartyRunLinkedMatchContext, 'mode' | 'matchId'> = {
    mode: 'duel',
    matchId: 'room-duel-match',
  };
  const groupLinkedContext: Pick<PartyRunLinkedMatchContext, 'mode' | 'matchId'> = {
    mode: 'group',
    matchId: 'room-group-match',
  };

  // duel: prefers the live duel status matchId
  assert.equal(resolveActiveLiveMatchProgressMatchId({
    matchMode: 'duel',
    duelMatchStatusMatchId: 'duel-status-match',
    groupMatchStatusMatchId: undefined,
    roomLinkedMatchContextMatchId: duelLinkedContext.matchId,
    roomLinkedMatchContextMode: duelLinkedContext.mode,
  }), 'duel-status-match');

  // duel: falls back to the linked room context only when it is a duel context
  assert.equal(resolveActiveLiveMatchProgressMatchId({
    matchMode: 'duel',
    duelMatchStatusMatchId: undefined,
    groupMatchStatusMatchId: undefined,
    roomLinkedMatchContextMatchId: duelLinkedContext.matchId,
    roomLinkedMatchContextMode: duelLinkedContext.mode,
  }), 'room-duel-match');

  assert.equal(resolveActiveLiveMatchProgressMatchId({
    matchMode: 'duel',
    duelMatchStatusMatchId: undefined,
    groupMatchStatusMatchId: undefined,
    roomLinkedMatchContextMatchId: groupLinkedContext.matchId,
    roomLinkedMatchContextMode: groupLinkedContext.mode,
  }), null);

  // group: prefers the live group status matchId, falls back to a group linked context
  assert.equal(resolveActiveLiveMatchProgressMatchId({
    matchMode: 'group',
    duelMatchStatusMatchId: undefined,
    groupMatchStatusMatchId: 'group-status-match',
    roomLinkedMatchContextMatchId: groupLinkedContext.matchId,
    roomLinkedMatchContextMode: groupLinkedContext.mode,
  }), 'group-status-match');

  assert.equal(resolveActiveLiveMatchProgressMatchId({
    matchMode: 'group',
    duelMatchStatusMatchId: undefined,
    groupMatchStatusMatchId: undefined,
    roomLinkedMatchContextMatchId: groupLinkedContext.matchId,
    roomLinkedMatchContextMode: groupLinkedContext.mode,
  }), 'room-group-match');

  // no linked context: nothing to fall back to
  assert.equal(resolveActiveLiveMatchProgressMatchId({
    matchMode: 'duel',
    duelMatchStatusMatchId: undefined,
    groupMatchStatusMatchId: undefined,
    roomLinkedMatchContextMatchId: undefined,
    roomLinkedMatchContextMode: undefined,
  }), null);

  // solo / other modes resolve to null
  assert.equal(resolveActiveLiveMatchProgressMatchId({
    matchMode: 'solo',
    duelMatchStatusMatchId: 'duel-status-match',
    groupMatchStatusMatchId: 'group-status-match',
    roomLinkedMatchContextMatchId: duelLinkedContext.matchId,
    roomLinkedMatchContextMode: duelLinkedContext.mode,
  }), null);
});
