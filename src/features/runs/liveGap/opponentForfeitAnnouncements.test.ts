import assert from 'node:assert/strict';
import test from 'node:test';

import type { GroupLiveStanding } from '@/features/runs/types/matchProgress';
import {
  buildForfeitAnnouncementSpeech,
  DUEL_OPPONENT_FALLBACK_ID,
  selectNewlyForfeitedAnnouncements,
  type ForfeitOpponentInput,
} from './opponentForfeitAnnouncements';

function standing(partial: Partial<GroupLiveStanding>): GroupLiveStanding {
  return {
    id: 'p',
    name: '러너',
    seedRank: 1,
    averagePace: '05:30/km',
    liveStatus: 'running',
    rank: 1,
    currentDistanceKm: 0,
    gapAheadKm: null,
    gapLeaderKm: 0,
    isForfeited: false,
    isCurrentUser: false,
    ...partial,
  } as unknown as GroupLiveStanding;
}

function opponent(partial: Partial<NonNullable<ForfeitOpponentInput>>): ForfeitOpponentInput {
  return {
    id: 'opp-1',
    name: '상대',
    liveStatus: 'running',
    ...partial,
  };
}

test('duel: announces the opponent once it forfeits, with its name', () => {
  const result = selectNewlyForfeitedAnnouncements({
    matchMode: 'duel',
    opponent: opponent({ id: 'opp-1', name: '철수', liveStatus: 'forfeited' }),
    alreadyAnnounced: new Set(),
  });

  assert.deepEqual(result, [{ id: 'opp-1', name: '철수', text: '철수님이 기권했어요' }]);
});

test('duel: no name falls back to 상대 message and the fallback id', () => {
  const result = selectNewlyForfeitedAnnouncements({
    matchMode: 'duel',
    opponent: opponent({ id: null, name: null, liveStatus: 'forfeited' }),
    alreadyAnnounced: new Set(),
  });

  assert.deepEqual(result, [{ id: DUEL_OPPONENT_FALLBACK_ID, name: null, text: '상대가 기권했어요' }]);
});

test('duel: not forfeited (running) yields nothing', () => {
  const result = selectNewlyForfeitedAnnouncements({
    matchMode: 'duel',
    opponent: opponent({ liveStatus: 'running' }),
    alreadyAnnounced: new Set(),
  });

  assert.deepEqual(result, []);
});

test('dedup: an already-announced duel forfeiter is not re-announced', () => {
  const result = selectNewlyForfeitedAnnouncements({
    matchMode: 'duel',
    opponent: opponent({ id: 'opp-1', name: '철수', liveStatus: 'forfeited' }),
    alreadyAnnounced: new Set(['opp-1']),
  });

  assert.deepEqual(result, []);
});

test('group: multiple simultaneous forfeits are all returned (newest last)', () => {
  const result = selectNewlyForfeitedAnnouncements({
    matchMode: 'group',
    standings: [
      standing({ id: 'a', name: '철수', isForfeited: true }),
      standing({ id: 'b', name: '영희', isForfeited: true }),
      standing({ id: 'c', name: '민수', isForfeited: false }),
    ],
    alreadyAnnounced: new Set(),
  });

  assert.deepEqual(result, [
    { id: 'a', name: '철수', text: '철수님이 기권했어요' },
    { id: 'b', name: '영희', text: '영희님이 기권했어요' },
  ]);
});

test('group: dedup — only the newly-forfeited (not the already-announced) is returned', () => {
  const result = selectNewlyForfeitedAnnouncements({
    matchMode: 'group',
    standings: [
      standing({ id: 'a', name: '철수', isForfeited: true }),
      standing({ id: 'b', name: '영희', isForfeited: true }),
    ],
    alreadyAnnounced: new Set(['a']),
  });

  assert.deepEqual(result, [{ id: 'b', name: '영희', text: '영희님이 기권했어요' }]);
});

test('group: the current user own forfeit is never announced', () => {
  const result = selectNewlyForfeitedAnnouncements({
    matchMode: 'group',
    standings: [
      standing({ id: 'me', name: '나', isForfeited: true, isCurrentUser: true }),
      standing({ id: 'b', name: '영희', isForfeited: true }),
    ],
    alreadyAnnounced: new Set(),
  });

  assert.deepEqual(result, [{ id: 'b', name: '영희', text: '영희님이 기권했어요' }]);
});

test('group: no forfeiters yields nothing', () => {
  const result = selectNewlyForfeitedAnnouncements({
    matchMode: 'group',
    standings: [
      standing({ id: 'a', name: '철수' }),
      standing({ id: 'b', name: '영희' }),
    ],
    alreadyAnnounced: new Set(),
  });

  assert.deepEqual(result, []);
});

test('inactive reset: after a fresh (empty) alreadyAnnounced set, a forfeiter announces again', () => {
  // Simulates the hook resetting announcedIds when the match goes inactive: the SAME
  // forfeiter id that was previously announced is spoken again in the next match because
  // the set was cleared.
  const opp = opponent({ id: 'opp-1', name: '철수', liveStatus: 'forfeited' });

  const first = selectNewlyForfeitedAnnouncements({
    matchMode: 'duel',
    opponent: opp,
    alreadyAnnounced: new Set(['opp-1']),
  });
  assert.deepEqual(first, [], 'still suppressed while the announced set carries the id');

  const afterReset = selectNewlyForfeitedAnnouncements({
    matchMode: 'duel',
    opponent: opp,
    alreadyAnnounced: new Set(),
  });
  assert.deepEqual(afterReset, [{ id: 'opp-1', name: '철수', text: '철수님이 기권했어요' }]);
});

test('speech: a single announcement reads its own message', () => {
  assert.equal(
    buildForfeitAnnouncementSpeech([{ id: 'a', name: '철수', text: '철수님이 기권했어요' }]),
    '철수님이 기권했어요',
  );
});

test('speech: same-tick forfeiters fold into ONE utterance when all are named', () => {
  assert.equal(
    buildForfeitAnnouncementSpeech([
      { id: 'a', name: '철수', text: '철수님이 기권했어요' },
      { id: 'b', name: '영희', text: '영희님이 기권했어요' },
    ]),
    '철수님, 영희님이 기권했어요',
  );
});

test('speech: with any unknown name, several forfeiters read 여러 명이 기권했어요', () => {
  assert.equal(
    buildForfeitAnnouncementSpeech([
      { id: 'a', name: '철수', text: '철수님이 기권했어요' },
      { id: 'b', name: null, text: '상대가 기권했어요' },
    ]),
    '여러 명이 기권했어요',
  );
});

test('speech: empty list reads nothing', () => {
  assert.equal(buildForfeitAnnouncementSpeech([]), '');
});
