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
    elapsedSeconds: 125,
    participants: [
      participant({ id: 'me', name: '나', isCurrentUser: true }),
      participant({ id: 'opponent', name: '상대' }),
    ],
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].resultLabel, 'FORFEIT');
  assert.equal(rows[0].durationLabel, '02:05');
  assert.equal(rows[0].isCurrentUser, true);
  assert.equal(rows[1].resultLabel, 'ING');
  assert.equal(rows[1].isInProgress, true);
});

test('room-linked group fallback rows keep ranks and mark current user as not in progress', () => {
  const rows = buildRoomLinkedGroupForfeitResultRows({
    elapsedSeconds: 65,
    participants: [
      participant({ id: 'me', name: '나', isCurrentUser: true, rankLabel: '2' }),
      participant({ id: 'runner-2', name: '상대', rankLabel: '1' }),
    ],
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].rank, 2);
  assert.equal(rows[0].durationLabel, '01:05');
  assert.equal(rows[0].isCurrentUser, true);
  assert.equal(rows[0].isInProgress, false);
  assert.equal(rows[1].rank, 1);
  assert.equal(rows[1].isInProgress, true);
});
