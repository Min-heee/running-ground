import assert from 'node:assert/strict';
import test from 'node:test';
import type { ArenaParticipantViewModel } from '@/features/runs/viewModels/matchViewModels';
import {
  buildRoomLinkedDuelForfeitResultRows,
  buildRoomLinkedGroupForfeitResultRows,
} from './matchResultFallbackRows';

function participant(overrides: Partial<ArenaParticipantViewModel> = {}): ArenaParticipantViewModel {
  return {
    id: 'runner',
    name: '러너',
    paceLabel: '05:30/km',
    distanceKm: 1,
    liveStatus: 'running',
    ...overrides,
  };
}

test('room-linked duel fallback rows surface current user forfeit without official status rows', () => {
  const rows = buildRoomLinkedDuelForfeitResultRows({
    currentUserForfeitSnapshot: {
      matchId: 'party-duel-match',
      forfeitedAt: 1,
      elapsedSeconds: 65,
      distanceKm: 0.2,
      paceLabel: '05:25/km',
    },
    liveElapsedSeconds: 125,
    participants: [
      participant({ id: 'me', name: '나', isCurrentUser: true }),
      participant({ id: 'opponent', name: '상대' }),
    ],
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].resultLabel, 'FORFEIT');
  assert.equal(rows[0].durationLabel, '01:05');
  assert.equal(rows[0].paceLabel, '05:25/km');
  assert.equal(rows[0].isCurrentUser, true);
  assert.equal(rows[1].resultLabel, 'ING');
  assert.equal(rows[1].durationLabel, '02:05');
  assert.equal(rows[1].isInProgress, true);
});

test('room-linked group fallback rows keep ranks and mark current user as not in progress', () => {
  const rows = buildRoomLinkedGroupForfeitResultRows({
    currentUserForfeitSnapshot: {
      matchId: 'party-group-match',
      forfeitedAt: 1,
      elapsedSeconds: 45,
      distanceKm: 0.1,
      paceLabel: '07:30/km',
    },
    liveElapsedSeconds: 65,
    participants: [
      participant({ id: 'me', name: '나', isCurrentUser: true, rankLabel: '2' }),
      participant({ id: 'runner-2', name: '상대', rankLabel: '1' }),
    ],
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].rank, 2);
  assert.equal(rows[0].durationLabel, '00:45');
  assert.equal(rows[0].paceLabel, '07:30/km');
  assert.equal(rows[0].isCurrentUser, true);
  assert.equal(rows[0].isInProgress, false);
  assert.equal(rows[1].rank, 1);
  assert.equal(rows[1].durationLabel, '01:05');
  assert.equal(rows[1].isInProgress, true);
});

test('room-linked duel fallback freezes remote forfeited rows from participant progress only', () => {
  const rows = buildRoomLinkedDuelForfeitResultRows({
    currentUserForfeitSnapshot: null,
    liveElapsedSeconds: 180,
    participants: [
      participant({ id: 'me', name: '나', isCurrentUser: true }),
      participant({
        id: 'opponent',
        name: '상대',
        elapsedSeconds: 70,
        liveStatus: 'forfeited',
        paceLabel: '기권',
        progressPaceLabel: '06:40/km',
      }),
    ],
  });

  assert.equal(rows[0].resultLabel, 'ING');
  assert.equal(rows[0].durationLabel, '03:00');
  assert.equal(rows[1].resultLabel, 'FORFEIT');
  assert.equal(rows[1].durationLabel, '01:10');
  assert.equal(rows[1].paceLabel, '06:40/km');
});

test('room-linked duel fallback does not project elapsed for forfeited remote rows without progress', () => {
  const rows = buildRoomLinkedDuelForfeitResultRows({
    currentUserForfeitSnapshot: null,
    liveElapsedSeconds: 240,
    participants: [
      participant({ id: 'me', name: '나', isCurrentUser: true }),
      participant({
        id: 'opponent',
        name: '상대',
        liveStatus: 'forfeited',
        paceLabel: '기권',
      }),
    ],
  });

  assert.equal(rows[0].durationLabel, '04:00');
  assert.equal(rows[1].resultLabel, 'FORFEIT');
  assert.equal(rows[1].durationLabel, '00:00');
  assert.equal(rows[1].paceLabel, '기권');
});
