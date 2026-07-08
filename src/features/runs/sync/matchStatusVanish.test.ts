import { strict as assert } from 'node:assert';
import test from 'node:test';
import { ApiError } from '@/services/apiError';
import {
  advanceMatchStatusVanishState,
  isMatchStatusVanishConfirmed,
  isMatchStatusVanishError,
  resetMatchStatusVanishState,
  shouldTeardownVanishedLinkedMatch,
} from './matchStatusVanish';

function invalidMatchStatusError(invalidReason: string, expectedMatchId = 'match-1') {
  return new ApiError('request', 'invalid match status', {
    details: {
      action: 'fetch-match-status',
      code: 'invalid_match_status_response',
      expectedMatchId,
      invalidReason,
      payload: {},
    },
  });
}

test('match status vanish error accepts missing expected matchId responses', () => {
  assert.equal(isMatchStatusVanishError(invalidMatchStatusError('missingMatchId'), 'match-1'), true);
  assert.equal(isMatchStatusVanishError(invalidMatchStatusError('mismatchedMatchId'), 'match-1'), true);
});

test('match status vanish error ignores unrelated guard failures', () => {
  assert.equal(isMatchStatusVanishError(invalidMatchStatusError('missingDistanceKm'), 'match-1'), false);
  assert.equal(isMatchStatusVanishError(invalidMatchStatusError('missingMatchId'), 'match-2'), false);
  assert.equal(isMatchStatusVanishError(new Error('network'), 'match-1'), false);
});

test('match status vanish state requires two consecutive signals for the same match', () => {
  const first = advanceMatchStatusVanishState({ count: 0, matchId: null }, 'match-1');
  assert.equal(isMatchStatusVanishConfirmed(first), false);

  const second = advanceMatchStatusVanishState(first, 'match-1');
  assert.equal(isMatchStatusVanishConfirmed(second), true);

  const switched = advanceMatchStatusVanishState(second, 'match-2');
  assert.deepEqual(switched, { count: 1, matchId: 'match-2' });
  assert.equal(isMatchStatusVanishConfirmed(switched), false);
});

test('match status vanish state resets only for matching ids when provided', () => {
  const current = { count: 2, matchId: 'match-1' };

  assert.deepEqual(resetMatchStatusVanishState(current, 'match-2'), current);
  assert.deepEqual(resetMatchStatusVanishState(current, 'match-1'), { count: 0, matchId: null });
  assert.deepEqual(resetMatchStatusVanishState(current), { count: 0, matchId: null });
});

test('vanished linked match teardown skips users already viewing their result page', () => {
  assert.equal(shouldTeardownVanishedLinkedMatch({
    hasMatchResultPage: true,
    vanishConfirmed: true,
  }), false);
  assert.equal(shouldTeardownVanishedLinkedMatch({
    hasMatchResultPage: false,
    vanishConfirmed: true,
  }), true);
  assert.equal(shouldTeardownVanishedLinkedMatch({
    hasMatchResultPage: false,
    vanishConfirmed: false,
  }), false);
});

test('FIX-B: vanished linked match teardown defers while the tracker actively records the match', () => {
  // The 7/9 incident: vanish confirmed MID-RUN (status polls answered idle-without-matchId
  // after the un-acked finish pruned the session) → the teardown demoted matchMode to 'solo'
  // and the save lost its matchId/matchResult. Actively recording ⇒ never tear down.
  assert.equal(shouldTeardownVanishedLinkedMatch({
    hasMatchResultPage: false,
    vanishConfirmed: true,
    isActivelyRecordingMatch: true,
  }), false);

  // Not recording anymore (saved/discarded) ⇒ the deferred teardown proceeds as before.
  assert.equal(shouldTeardownVanishedLinkedMatch({
    hasMatchResultPage: false,
    vanishConfirmed: true,
    isActivelyRecordingMatch: false,
  }), true);

  // Omitted flag keeps the pre-FIX-B behavior (backwards compatible callers).
  assert.equal(shouldTeardownVanishedLinkedMatch({
    hasMatchResultPage: false,
    vanishConfirmed: true,
  }), true);
});
