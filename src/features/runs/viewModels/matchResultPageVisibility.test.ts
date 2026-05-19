import assert from 'node:assert/strict';
import test from 'node:test';
import type { ArenaParticipantViewModel } from '@/features/runs/viewModels/matchViewModels';
import {
  resolveCurrentUserFinishedForResultPage,
  shouldShowMatchResultPageOnCurrentUserFinished,
} from './matchResultPageVisibility';

function participant(overrides: Partial<ArenaParticipantViewModel> = {}): ArenaParticipantViewModel {
  return {
    id: 'runner',
    name: '러너',
    paceLabel: '05:30/km',
    distanceKm: 1,
    ...overrides,
  };
}

test('result page stays hidden before current user finishes', () => {
  assert.equal(resolveCurrentUserFinishedForResultPage({
    matchMode: 'duel',
    duelArenaParticipants: [
      participant({ id: 'me', isCurrentUser: true, liveStatus: 'running' }),
      participant({ id: 'opponent', liveStatus: 'finished' }),
    ],
    roomLinkedDuelPlaceholderParticipants: [],
    groupArenaParticipants: [],
    roomLinkedGroupPlaceholderParticipants: [],
  }), false);

  assert.equal(shouldShowMatchResultPageOnCurrentUserFinished({
    matchMode: 'duel',
    currentUserFinished: false,
    hasTrackedMatchResult: true,
  }), false);
});

test('duel result page shows as soon as current user finishes without tracked result', () => {
  const currentUserFinished = resolveCurrentUserFinishedForResultPage({
    matchMode: 'duel',
    duelArenaParticipants: [
      participant({ id: 'me', isCurrentUser: true, liveStatus: 'finished' }),
      participant({ id: 'opponent', liveStatus: 'running' }),
    ],
    roomLinkedDuelPlaceholderParticipants: [],
    groupArenaParticipants: [],
    roomLinkedGroupPlaceholderParticipants: [],
  });

  assert.equal(currentUserFinished, true);
  assert.equal(shouldShowMatchResultPageOnCurrentUserFinished({
    matchMode: 'duel',
    currentUserFinished,
    hasTrackedMatchResult: false,
  }), true);
});

test('duel result page can use room-linked placeholder participants', () => {
  const currentUserFinished = resolveCurrentUserFinishedForResultPage({
    matchMode: 'duel',
    duelArenaParticipants: [],
    roomLinkedDuelPlaceholderParticipants: [
      participant({ id: 'me', isCurrentUser: true, liveStatus: 'finished' }),
      participant({ id: 'opponent', liveStatus: 'running' }),
    ],
    groupArenaParticipants: [],
    roomLinkedGroupPlaceholderParticipants: [],
  });

  assert.equal(currentUserFinished, true);
});

test('group result page shows current user finish while others are still running', () => {
  const currentUserFinished = resolveCurrentUserFinishedForResultPage({
    matchMode: 'group',
    duelArenaParticipants: [],
    roomLinkedDuelPlaceholderParticipants: [],
    groupArenaParticipants: [
      participant({ id: 'me', isCurrentUser: true, liveStatus: 'finished' }),
      participant({ id: 'runner-2', liveStatus: 'running' }),
    ],
    roomLinkedGroupPlaceholderParticipants: [],
  });

  assert.equal(currentUserFinished, true);
  assert.equal(shouldShowMatchResultPageOnCurrentUserFinished({
    matchMode: 'group',
    currentUserFinished,
    hasTrackedMatchResult: false,
  }), true);
});

test('solo mode never shows match result page from match finish state', () => {
  assert.equal(resolveCurrentUserFinishedForResultPage({
    matchMode: 'solo',
    duelArenaParticipants: [],
    roomLinkedDuelPlaceholderParticipants: [],
    groupArenaParticipants: [participant({ isCurrentUser: true, liveStatus: 'finished' })],
    roomLinkedGroupPlaceholderParticipants: [],
  }), false);

  assert.equal(shouldShowMatchResultPageOnCurrentUserFinished({
    matchMode: 'solo',
    currentUserFinished: true,
    hasTrackedMatchResult: true,
  }), false);
});
