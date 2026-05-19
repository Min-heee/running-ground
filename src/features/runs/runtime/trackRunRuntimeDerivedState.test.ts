import assert from 'node:assert/strict';
import test from 'node:test';
import type { ArenaParticipantViewModel } from '@/features/runs/viewModels/matchViewModels';
import {
  resolveCurrentUserArenaPace,
  resolveDuelLiveSummary,
  resolveRoomLinkedDuelProgress,
  resolveTrackRunRuntimeRouteHydration,
} from './trackRunRuntimeDerivedState';

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
