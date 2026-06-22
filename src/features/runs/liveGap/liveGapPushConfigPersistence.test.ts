import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getLiveGapPushConfig,
  resetLiveGapPushConfigForTests,
  setLiveGapInterval,
  setLiveGapRemember,
} from './liveGapPushConfig';
import {
  initializeLiveGapPushConfigPersistence,
  resetLiveGapPushConfigPersistenceForTests,
  type LiveGapConfigStorageAdapter,
} from './liveGapPushConfigPersistence';

// In-memory storage port. The methods are synchronous internally (no awaited I/O) so the
// fire-and-forget persist writes inside the store subscription settle within the same
// microtask the store mutation runs in — no extra ticking needed in the assertions.
function createMemoryAdapter(initial: string | null = null) {
  let value = initial;
  const calls = { read: 0, writes: [] as string[], removes: 0 };
  const adapter: LiveGapConfigStorageAdapter = {
    async read() {
      calls.read += 1;
      return value;
    },
    async write(next: string) {
      calls.writes.push(next);
      value = next;
    },
    async remove() {
      calls.removes += 1;
      value = null;
    },
  };
  return { adapter, calls, current: () => value };
}

function reset() {
  resetLiveGapPushConfigPersistenceForTests();
  resetLiveGapPushConfigForTests();
}

test('initialize restores an opted-in saved config without rewriting or wiping it', async () => {
  reset();
  const saved = JSON.stringify({
    interval: '3m',
    groupTargets: ['rank1'],
    metrics: ['avgPace'],
    deliveryMode: 'both',
    remember: true,
  });
  const mem = createMemoryAdapter(saved);

  await initializeLiveGapPushConfigPersistence(mem.adapter);

  const config = getLiveGapPushConfig();
  assert.equal(config.interval, '3m');
  assert.equal(config.deliveryMode, 'both');
  assert.deepEqual(config.metrics, ['avgPace']);
  assert.equal(config.remember, true);
  // Hydration happens before the persist subscription is wired, so the restore must not
  // have written or removed anything.
  assert.equal(mem.calls.writes.length, 0);
  assert.equal(mem.calls.removes, 0);
  assert.equal(mem.current(), saved);
});

test('with nothing saved, turning remember on persists the full config and later changes', async () => {
  reset();
  const mem = createMemoryAdapter(null);

  await initializeLiveGapPushConfigPersistence(mem.adapter);
  // Default config, remember off — nothing persisted until something changes.
  assert.equal(mem.calls.writes.length, 0);

  setLiveGapRemember(true);
  assert.equal(mem.calls.writes.length, 1);
  assert.equal(JSON.parse(mem.calls.writes[0]).remember, true);

  setLiveGapInterval('1m');
  assert.equal(mem.calls.writes.length, 2);
  assert.equal(JSON.parse(mem.calls.writes[1]).interval, '1m');
});

test('turning remember off wipes the stored copy', async () => {
  reset();
  const mem = createMemoryAdapter(JSON.stringify({
    interval: '1m',
    groupTargets: [],
    metrics: ['remainingDistance'],
    deliveryMode: 'voice',
    remember: true,
  }));

  await initializeLiveGapPushConfigPersistence(mem.adapter);
  assert.equal(getLiveGapPushConfig().remember, true);

  setLiveGapRemember(false);
  assert.ok(mem.calls.removes >= 1);
  assert.equal(mem.current(), null);
});

test('a corrupt saved payload is dropped and the store falls back to defaults', async () => {
  reset();
  const mem = createMemoryAdapter('{ not valid json');

  await initializeLiveGapPushConfigPersistence(mem.adapter);

  assert.equal(getLiveGapPushConfig().interval, 'off');
  assert.equal(getLiveGapPushConfig().remember, false);
  assert.ok(mem.calls.removes >= 1);
  assert.equal(mem.current(), null);
});

test('a saved payload with remember=false is ignored on launch', async () => {
  reset();
  const mem = createMemoryAdapter(JSON.stringify({
    interval: '5m',
    groupTargets: [],
    metrics: [],
    deliveryMode: 'voice',
    remember: false,
  }));

  await initializeLiveGapPushConfigPersistence(mem.adapter);

  assert.equal(getLiveGapPushConfig().interval, 'off');
});

test('a second initialize is a no-op — no re-hydrate, no duplicate subscription', async () => {
  reset();
  const first = createMemoryAdapter(null);
  await initializeLiveGapPushConfigPersistence(first.adapter);
  setLiveGapRemember(true);
  assert.equal(first.calls.writes.length, 1);

  const second = createMemoryAdapter(JSON.stringify({
    interval: '5m',
    groupTargets: [],
    metrics: [],
    deliveryMode: 'voice',
    remember: true,
  }));
  await initializeLiveGapPushConfigPersistence(second.adapter);

  // Guard short-circuits: the second adapter is never read, and the store is untouched.
  assert.equal(second.calls.read, 0);
  assert.equal(getLiveGapPushConfig().interval, 'off');

  // Only the first subscription is live, so a change writes to the first adapter only.
  setLiveGapInterval('3m');
  assert.equal(second.calls.writes.length, 0);
  assert.ok(first.calls.writes.length >= 2);
});
