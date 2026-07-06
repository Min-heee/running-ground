import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ROOM_SNAPSHOT_LIFELINE_STALE_AFTER_MS,
  shouldForceRoomSnapshotLifelineLoad,
} from './roomSnapshotLifelineDecision';

const BASE_NOW_MS = 1_751_800_000_000;

function buildTickInput(overrides: Partial<Parameters<typeof shouldForceRoomSnapshotLifelineLoad>[0]> = {}) {
  return {
    focused: true,
    hasLinkedMatch: false,
    inFlight: false,
    // 10s since the last completed 'match-room snapshot' check — past the 6s stale threshold.
    lastCheckMs: BASE_NOW_MS - 10_000,
    mounted: true,
    nowMs: BASE_NOW_MS,
    paused: false,
    ...overrides,
  };
}

test('room snapshot lifeline fires when the stamp is stale, lobby focused, and no linked match yet', () => {
  assert.equal(shouldForceRoomSnapshotLifelineLoad(buildTickInput()), true);
});

test('room snapshot lifeline skips while the stamp is fresh (healthy poller keeps it no-op)', () => {
  // The waiting-room poller completes a check every ~1.5-2s, so a healthy channel keeps the
  // stamp well inside 6s.
  assert.equal(
    shouldForceRoomSnapshotLifelineLoad(buildTickInput({ lastCheckMs: BASE_NOW_MS - 2_000 })),
    false,
  );
  // Exactly AT the threshold is still fresh — only strictly-greater staleness fires.
  assert.equal(
    shouldForceRoomSnapshotLifelineLoad(buildTickInput({
      lastCheckMs: BASE_NOW_MS - ROOM_SNAPSHOT_LIFELINE_STALE_AFTER_MS,
    })),
    false,
  );
  assert.equal(
    shouldForceRoomSnapshotLifelineLoad(buildTickInput({
      lastCheckMs: BASE_NOW_MS - ROOM_SNAPSHOT_LIFELINE_STALE_AFTER_MS - 1,
    })),
    true,
  );
});

test('room snapshot lifeline fires when NO snapshot check has ever completed', () => {
  // No stamp at all means the normal poller has never delivered — that is the latch signature.
  assert.equal(
    shouldForceRoomSnapshotLifelineLoad(buildTickInput({ lastCheckMs: null })),
    true,
  );
});

test('room snapshot lifeline goes silent once the room has a linked match', () => {
  // The guest already learned the host-start; the lobby handoff owns delivery from here.
  assert.equal(
    shouldForceRoomSnapshotLifelineLoad(buildTickInput({ hasLinkedMatch: true })),
    false,
  );
});

test('room snapshot lifeline skips when the lobby is paused, unfocused, or unmounted', () => {
  assert.equal(shouldForceRoomSnapshotLifelineLoad(buildTickInput({ paused: true })), false);
  assert.equal(shouldForceRoomSnapshotLifelineLoad(buildTickInput({ focused: false })), false);
  assert.equal(shouldForceRoomSnapshotLifelineLoad(buildTickInput({ mounted: false })), false);
});

test('room snapshot lifeline never stacks loads while one is in flight', () => {
  assert.equal(shouldForceRoomSnapshotLifelineLoad(buildTickInput({ inFlight: true })), false);
});
