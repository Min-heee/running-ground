import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acquireRgPollingSlot,
  getActiveRgPollingSlotCount,
  resetRgPollingRegistryForTest,
  startRgPollingInterval,
} from '@/utils/rgPollingRegistry';
import { armRoomSnapshotPollRetry } from './roomSnapshotPollRetry';

type FakeTimer = { id: number; callback: () => void; intervalMs: number };

function createFakeTimerHarness() {
  const timers: FakeTimer[] = [];
  const cleared: FakeTimer[] = [];

  return {
    timers,
    cleared,
    setIntervalFn: ((callback: () => void, intervalMs: number) => {
      const timer = { id: timers.length + 1, callback, intervalMs };
      timers.push(timer);
      return timer;
    }) as unknown as typeof setInterval,
    clearIntervalFn: ((timer: FakeTimer) => {
      cleared.push(timer);
    }) as unknown as typeof clearInterval,
  };
}

// Lobby-room poll latch fix Piece 1a — the snapshot poller's lost acquire is no longer
// permanently dead. The seam keeps re-attempting the room's snapshot slot at the poll cadence;
// once the zombie owner releases, the next retry tick re-acquires, fires exactly ONE immediate
// catch-up loadRoom, and stops retrying.
test('room snapshot poll retry re-acquires after a zombie owner releases and fires one catch-up loadRoom', async () => {
  resetRgPollingRegistryForTest();
  const pollingKey = 'room:room-retry-1:match-room-snapshot';
  const zombie = acquireRgPollingSlot(pollingKey, 'match-room snapshot polling', {
    source: 'zombie owner',
  });
  assert.equal(zombie.acquired, true);

  let loadRoomCount = 0;
  const loadRoom = () => {
    loadRoomCount += 1;
    return Promise.resolve(null);
  };
  const harness = createFakeTimerHarness();

  // The effect's first startRgPollingInterval loses the acquire (the zombie owns the key)...
  const initial = startRgPollingInterval({
    // Real poll cadence far beyond the test lifetime — an acquired poll never ticks here, so any
    // loadRoomCount increment can only be the retry's immediate catch-up tick.
    intervalMs: 600_000,
    key: pollingKey,
    label: 'match-room snapshot polling',
    onTick: loadRoom,
  });
  assert.equal(initial.acquired, false);

  // ...so the lose branch arms the retry seam at the same cadence.
  const retry = armRoomSnapshotPollRetry({
    detail: {
      intervalMs: 600_000,
      roomId: 'room-retry-1',
      source: 'match-room snapshot',
    },
    intervalMs: 600_000,
    onTick: loadRoom,
    pollingKey,
    roomId: 'room-retry-1',
    clearIntervalFn: harness.clearIntervalFn,
    setIntervalFn: harness.setIntervalFn,
  });
  assert.equal(harness.timers.length, 1);

  // While the zombie still owns the slot, retry ticks stay unacquired — no poll, no loadRoom.
  harness.timers[0].callback();
  await Promise.resolve();
  assert.equal(loadRoomCount, 0);
  assert.equal(getActiveRgPollingSlotCount(), 1);

  // Zombie dies (releases) → the NEXT retry tick re-acquires and fires ONE catch-up loadRoom.
  zombie.release();
  harness.timers[0].callback();
  await Promise.resolve();
  assert.equal(loadRoomCount, 1);
  assert.equal(getActiveRgPollingSlotCount(), 1);
  // The retry timer was stopped on re-acquire.
  assert.equal(harness.cleared.includes(harness.timers[0]), true);

  // A straggler retry callback after re-acquire is a no-op — no double-arm, no extra loadRoom.
  harness.timers[0].callback();
  await Promise.resolve();
  assert.equal(loadRoomCount, 1);
  assert.equal(getActiveRgPollingSlotCount(), 1);

  // Effect cleanup stops the live poll handle → zero slots left behind.
  retry.stop();
  assert.equal(getActiveRgPollingSlotCount(), 0);
});

test('room snapshot poll retry cleanup before re-acquire clears the timer and acquires nothing', async () => {
  resetRgPollingRegistryForTest();
  const pollingKey = 'room:room-retry-cleanup:match-room-snapshot';
  const zombie = acquireRgPollingSlot(pollingKey, 'match-room snapshot polling');
  assert.equal(zombie.acquired, true);

  let loadRoomCount = 0;
  const harness = createFakeTimerHarness();
  const retry = armRoomSnapshotPollRetry({
    detail: {
      intervalMs: 600_000,
      roomId: 'room-retry-cleanup',
      source: 'match-room snapshot',
    },
    intervalMs: 600_000,
    onTick: () => {
      loadRoomCount += 1;
      return Promise.resolve(null);
    },
    pollingKey,
    roomId: 'room-retry-cleanup',
    clearIntervalFn: harness.clearIntervalFn,
    setIntervalFn: harness.setIntervalFn,
  });
  assert.equal(harness.timers.length, 1);

  // Effect cleanup while still waiting for the slot: the retry timer is cleared...
  retry.stop();
  assert.equal(harness.cleared.includes(harness.timers[0]), true);

  // ...and even if a straggler retry callback fires after stop (and the slot is now free), it
  // must NOT acquire anything or load — the retry is dead.
  zombie.release();
  harness.timers[0].callback();
  await Promise.resolve();
  assert.equal(loadRoomCount, 0);
  assert.equal(getActiveRgPollingSlotCount(), 0);
});
