import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LINKED_MATCH_ARMING_POLL_MS,
  resolveLinkedMatchPollingCadence,
} from '@/features/runs/sync/partyRunSync/useLinkedMatchSync';

test('linked match polling uses 1s cadence while arming so clients poll in before countdown appears', () => {
  assert.deepEqual(resolveLinkedMatchPollingCadence({
    fastMatchStatusPollMs: 2500,
    idleMatchStatusPollMs: 3000,
    phase: 'arming',
    shouldOpenArena: false,
  }), {
    intervalMs: LINKED_MATCH_ARMING_POLL_MS,
    transitionReason: 'arming-poll-in',
  });

  assert.deepEqual(resolveLinkedMatchPollingCadence({
    fastMatchStatusPollMs: 2500,
    idleMatchStatusPollMs: 3000,
    phase: 'readyAcked',
    shouldOpenArena: false,
  }), {
    intervalMs: LINKED_MATCH_ARMING_POLL_MS,
    transitionReason: 'readyAcked-poll-in',
  });
});

test('linked match polling keeps existing fast countdown and idle cadences outside arming', () => {
  assert.deepEqual(resolveLinkedMatchPollingCadence({
    fastMatchStatusPollMs: 2500,
    idleMatchStatusPollMs: 3000,
    phase: 'countdown',
    shouldOpenArena: false,
  }), {
    intervalMs: 2500,
    transitionReason: 'countdown-handoff',
  });

  assert.deepEqual(resolveLinkedMatchPollingCadence({
    fastMatchStatusPollMs: 2500,
    idleMatchStatusPollMs: 3000,
    phase: 'waiting',
    shouldOpenArena: false,
  }), {
    intervalMs: 3000,
    transitionReason: 'linked-idle-sync',
  });
});
