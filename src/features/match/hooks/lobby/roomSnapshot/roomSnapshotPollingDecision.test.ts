import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LINKED_MATCH_PENDING_HANDOFF_POLL_MS,
  resolveMatchRoomSnapshotPollingDecision,
} from './roomSnapshotPollingDecision';

const WAITING_ROOM_POLL_MS = 1_500;

test('keeps polling at a reduced cadence while a linked match is pending arena handoff', () => {
  // linkedMatchId is set but neither the room nor the linked match is 'active' yet — the
  // guest could still miss a host cancel or the matched→active transition, so polling must
  // continue (just slower) instead of stopping the instant linkedMatchId lands.
  const decision = resolveMatchRoomSnapshotPollingDecision({
    linkedMatchId: 'match-1',
    state: 'arming',
    linkedMatchStatus: 'matched',
    waitingRoomPollMs: WAITING_ROOM_POLL_MS,
  });

  assert.equal(decision.enabled, true);
  assert.equal(decision.intervalMs, LINKED_MATCH_PENDING_HANDOFF_POLL_MS);
  assert.equal(decision.owner, 'match-room snapshot');
  assert.match(decision.reason, /pending-arena-handoff$/);
});

test('keeps polling when the linked match status is still matched even at countdown room state', () => {
  const decision = resolveMatchRoomSnapshotPollingDecision({
    linkedMatchId: 'match-2',
    state: 'countdown',
    linkedMatchStatus: 'matched',
    waitingRoomPollMs: WAITING_ROOM_POLL_MS,
  });

  assert.equal(decision.enabled, true);
  assert.equal(decision.intervalMs, LINKED_MATCH_PENDING_HANDOFF_POLL_MS);
});

test('stops polling once the room state is active (arena handoff confirmed)', () => {
  const decision = resolveMatchRoomSnapshotPollingDecision({
    linkedMatchId: 'match-3',
    state: 'active',
    linkedMatchStatus: 'matched',
    waitingRoomPollMs: WAITING_ROOM_POLL_MS,
  });

  assert.equal(decision.enabled, false);
  assert.equal(decision.owner, 'linked match status');
  assert.match(decision.reason, /live-match-handoff$/);
});

test('stops polling once the linked match itself reports active', () => {
  const decision = resolveMatchRoomSnapshotPollingDecision({
    linkedMatchId: 'match-4',
    state: 'countdown',
    linkedMatchStatus: 'active',
    waitingRoomPollMs: WAITING_ROOM_POLL_MS,
  });

  assert.equal(decision.enabled, false);
  assert.equal(decision.owner, 'linked match status');
});

test('keeps polling at the waiting-room cadence when there is no linked match yet', () => {
  const decision = resolveMatchRoomSnapshotPollingDecision({
    linkedMatchId: null,
    state: 'waiting',
    waitingRoomPollMs: WAITING_ROOM_POLL_MS,
  });

  assert.equal(decision.enabled, true);
  assert.equal(decision.intervalMs, WAITING_ROOM_POLL_MS);
  assert.equal(decision.owner, 'match-room snapshot');
  assert.equal(decision.reason, 'waiting-room-sync');
});
