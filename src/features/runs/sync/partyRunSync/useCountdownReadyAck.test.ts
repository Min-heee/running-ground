import assert from 'node:assert/strict';
import test from 'node:test';

import { isRoomStuckArming } from './useCountdownReadyAck';

const NOW_MS = Date.parse('2026-06-11T00:00:00.000Z');

function slotInSeconds(seconds: number) {
  return new Date(NOW_MS + seconds * 1000).toISOString();
}

test('isRoomStuckArming flags a linked pre-countdown room with no slot start', () => {
  assert.equal(isRoomStuckArming({ hasLinkedMatch: true, phase: 'arming', linkedMatchSlotStartAt: null, nowMs: NOW_MS }), true);
  assert.equal(isRoomStuckArming({ hasLinkedMatch: true, phase: 'arming', linkedMatchSlotStartAt: undefined, nowMs: NOW_MS }), true);
  // Group guests can stall after their own ACK, waiting on the last participant's slot start.
  assert.equal(isRoomStuckArming({ hasLinkedMatch: true, phase: 'readyAcked', linkedMatchSlotStartAt: null, nowMs: NOW_MS }), true);
});

test('isRoomStuckArming flags a stale far-out slot (pre-arm leftover) as stuck', () => {
  // Observed live: a guest pinned at r:17 against the pre-arm slot (+18s) it received
  // before the backend re-armed to +12s, with no channel left to deliver the update.
  assert.equal(
    isRoomStuckArming({ hasLinkedMatch: true, phase: 'arenaHandoff', linkedMatchSlotStartAt: slotInSeconds(17), nowMs: NOW_MS }),
    true,
  );
  assert.equal(
    isRoomStuckArming({ hasLinkedMatch: true, phase: 'arming', linkedMatchSlotStartAt: slotInSeconds(30), nowMs: NOW_MS }),
    true,
  );
});

test('isRoomStuckArming clears once the slot is near or the phase advances', () => {
  // A near slot (within the visible window + buffer) is the real armed slot — normal flow.
  assert.equal(
    isRoomStuckArming({ hasLinkedMatch: true, phase: 'arming', linkedMatchSlotStartAt: slotInSeconds(10), nowMs: NOW_MS }),
    false,
  );
  assert.equal(
    isRoomStuckArming({ hasLinkedMatch: true, phase: 'arenaHandoff', linkedMatchSlotStartAt: slotInSeconds(12), nowMs: NOW_MS }),
    false,
  );
  // Past the pre-countdown window → not the stuck state.
  assert.equal(isRoomStuckArming({ hasLinkedMatch: true, phase: 'countdown', linkedMatchSlotStartAt: null, nowMs: NOW_MS }), false);
  assert.equal(isRoomStuckArming({ hasLinkedMatch: true, phase: 'active', linkedMatchSlotStartAt: null, nowMs: NOW_MS }), false);
  // No linked match yet → nothing to recover.
  assert.equal(isRoomStuckArming({ hasLinkedMatch: false, phase: 'arming', linkedMatchSlotStartAt: null, nowMs: NOW_MS }), false);
});
