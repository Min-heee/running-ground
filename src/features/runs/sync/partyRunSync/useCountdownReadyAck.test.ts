import assert from 'node:assert/strict';
import test from 'node:test';

import { isRoomStuckArming } from './useCountdownReadyAck';

test('isRoomStuckArming flags a linked pre-countdown room with no slot start', () => {
  assert.equal(isRoomStuckArming({ hasLinkedMatch: true, phase: 'arming', linkedMatchSlotStartAt: null }), true);
  assert.equal(isRoomStuckArming({ hasLinkedMatch: true, phase: 'arming', linkedMatchSlotStartAt: undefined }), true);
  // Group guests can stall after their own ACK, waiting on the last participant's slot start.
  assert.equal(isRoomStuckArming({ hasLinkedMatch: true, phase: 'readyAcked', linkedMatchSlotStartAt: null }), true);
});

test('isRoomStuckArming clears once the slot start lands or the phase advances', () => {
  // Slot start delivered → recovered, the watchdog must stop.
  assert.equal(
    isRoomStuckArming({ hasLinkedMatch: true, phase: 'arming', linkedMatchSlotStartAt: '2026-06-09T00:00:00Z' }),
    false,
  );
  // Past the pre-countdown window → not the stuck state.
  assert.equal(isRoomStuckArming({ hasLinkedMatch: true, phase: 'countdown', linkedMatchSlotStartAt: null }), false);
  assert.equal(isRoomStuckArming({ hasLinkedMatch: true, phase: 'active', linkedMatchSlotStartAt: null }), false);
  // No linked match yet → nothing to recover.
  assert.equal(isRoomStuckArming({ hasLinkedMatch: false, phase: 'arming', linkedMatchSlotStartAt: null }), false);
});
