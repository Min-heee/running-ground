import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCurrentUserResultLabel,
  getParticipantArenaLabel,
  isCurrentUserFinished,
  resolveParticipantViewState,
  shouldShowParticipantInRaceBoard,
  shouldShowResultPage,
  type ProgressiveParticipant,
} from './matchResultProgressive';

const earlier = '2026-05-19T10:00:00.000Z';
const later = '2026-05-19T10:00:10.000Z';

function participant(overrides: Partial<ProgressiveParticipant> = {}): ProgressiveParticipant {
  return {
    liveStatus: 'running',
    ...overrides,
  };
}

test('progressive result view state covers self, visible finished runners, and hidden running opponents', () => {
  assert.equal(
    resolveParticipantViewState({
      participant: participant({ isCurrentUser: true, liveStatus: 'running' }),
      isCurrentUserFinished: false,
    }),
    'running',
  );
  assert.equal(
    resolveParticipantViewState({
      participant: participant({ isCurrentUser: true, liveStatus: 'finished' }),
      isCurrentUserFinished: true,
    }),
    'finished-self',
  );
  assert.equal(
    resolveParticipantViewState({
      participant: participant({ liveStatus: 'finished' }),
      isCurrentUserFinished: false,
    }),
    'finished-other-visible',
  );
  assert.equal(
    resolveParticipantViewState({
      participant: participant({ liveStatus: 'running' }),
      isCurrentUserFinished: false,
    }),
    'finished-other-hidden',
  );
  assert.equal(
    resolveParticipantViewState({
      participant: participant({ liveStatus: 'running' }),
      isCurrentUserFinished: true,
    }),
    'running',
  );
});

test('race board visibility hides other running participants until the current user finishes', () => {
  assert.equal(shouldShowParticipantInRaceBoard('running'), true);
  assert.equal(shouldShowParticipantInRaceBoard('finished-self'), true);
  assert.equal(shouldShowParticipantInRaceBoard('finished-other-visible'), true);
  assert.equal(shouldShowParticipantInRaceBoard('finished-other-hidden'), false);
});

test('duel result label resolves win, lose, draw, and in-progress result states', () => {
  assert.equal(
    getCurrentUserResultLabel(
      participant({ isCurrentUser: true, liveStatus: 'finished', finishedAt: earlier }),
      participant({ liveStatus: 'running' }),
      'duel',
    ),
    'WIN',
  );
  assert.equal(
    getCurrentUserResultLabel(
      participant({ isCurrentUser: true, liveStatus: 'finished', finishedAt: later }),
      participant({ liveStatus: 'finished', finishedAt: earlier }),
      'duel',
    ),
    'LOSE',
  );
  assert.equal(
    getCurrentUserResultLabel(
      participant({ isCurrentUser: true, liveStatus: 'finished', finishedAt: earlier }),
      participant({ liveStatus: 'finished', finishedAt: earlier }),
      'duel',
    ),
    'DRAW',
  );
  assert.equal(
    getCurrentUserResultLabel(
      participant({ isCurrentUser: true, liveStatus: 'running' }),
      participant({ liveStatus: 'finished', finishedAt: earlier }),
      'duel',
    ),
    null,
  );
  assert.equal(
    getCurrentUserResultLabel(
      participant({ isCurrentUser: true, liveStatus: 'finished', finishedAt: earlier }),
      participant({ liveStatus: 'finished', finishedAt: later }),
      'group',
    ),
    null,
  );
});

test('duel result label handles forfeit as a terminal result edge case', () => {
  assert.equal(
    getCurrentUserResultLabel(
      participant({ isCurrentUser: true, liveStatus: 'forfeited' }),
      participant({ liveStatus: 'running' }),
      'duel',
    ),
    'LOSE',
  );
  assert.equal(
    getCurrentUserResultLabel(
      participant({ isCurrentUser: true, liveStatus: 'running' }),
      participant({ liveStatus: 'forfeited' }),
      'duel',
    ),
    'WIN',
  );
  assert.equal(
    getCurrentUserResultLabel(
      participant({ isCurrentUser: true, liveStatus: 'forfeited' }),
      participant({ liveStatus: 'forfeited' }),
      'duel',
    ),
    'DRAW',
  );
});

test('arena labels expose group ranks and duel opponent result labels without changing UI yet', () => {
  assert.deepEqual(
    getParticipantArenaLabel(
      participant({ isCurrentUser: true, liveStatus: 'finished', rankLabel: '1등' }),
      'group',
      earlier,
    ),
    { kind: 'rank', text: '1등' },
  );
  assert.deepEqual(
    getParticipantArenaLabel(
      participant({ liveStatus: 'finished', finishedAt: earlier }),
      'duel',
      later,
    ),
    { kind: 'result', text: 'WIN' },
  );
  assert.deepEqual(
    getParticipantArenaLabel(
      participant({ liveStatus: 'finished', finishedAt: later }),
      'duel',
      earlier,
    ),
    { kind: 'result', text: 'LOSE' },
  );
  assert.deepEqual(
    getParticipantArenaLabel(
      participant({ isCurrentUser: true, liveStatus: 'finished', finishedAt: earlier }),
      'duel',
      earlier,
      'WIN',
    ),
    { kind: 'result', text: 'WIN' },
  );
});

test('disconnected and paused participants stay in running state until terminal status arrives', () => {
  assert.equal(
    resolveParticipantViewState({
      participant: participant({ liveStatus: 'disconnected' }),
      isCurrentUserFinished: false,
    }),
    'finished-other-hidden',
  );
  assert.equal(
    resolveParticipantViewState({
      participant: participant({ liveStatus: 'paused' }),
      isCurrentUserFinished: true,
    }),
    'running',
  );
});

test('current user terminal state controls result page entry', () => {
  assert.equal(isCurrentUserFinished([
    participant({ isCurrentUser: true, liveStatus: 'running' }),
    participant({ liveStatus: 'finished' }),
  ]), false);
  assert.equal(isCurrentUserFinished([
    participant({ isCurrentUser: true, liveStatus: 'finished' }),
    participant({ liveStatus: 'running' }),
  ]), true);
  assert.equal(isCurrentUserFinished([
    participant({ isCurrentUser: true, liveStatus: 'forfeited' }),
  ]), true);
  assert.equal(shouldShowResultPage(true, 'duel'), true);
  assert.equal(shouldShowResultPage(true, 'group'), true);
  assert.equal(shouldShowResultPage(false, 'duel'), false);
});
