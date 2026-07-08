import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createKeyedRequestRegistry,
  createKeyedSingleFlightRegistry,
  createKeyedSlotRegistry,
  createKeyedValueRegistry,
} from './rgKeyedRegistry';

test('keyed slot registry blocks duplicate starts and restarts after stop', () => {
  const registry = createKeyedSlotRegistry();
  const first = registry.acquire('blocking-match-status:match-1', 'blocking match status polling');
  assert.equal(first.acquired, true);
  assert.equal(registry.getActiveCount(), 1);

  const duplicate = registry.acquire('blocking-match-status:match-1', 'blocking match status polling');
  assert.equal(duplicate.acquired, false);
  assert.equal(duplicate.ownerId, first.ownerId);
  assert.equal(registry.getActiveCount(), 1);

  duplicate.release();
  assert.equal(registry.getActiveCount(), 1);

  first.release();
  assert.equal(registry.getActiveCount(), 0);

  const restarted = registry.acquire('blocking-match-status:match-1', 'blocking match status polling');
  assert.equal(restarted.acquired, true);
  restarted.release();
});

test('keyed slot registry evict force-frees a held key regardless of owner', () => {
  const registry = createKeyedSlotRegistry();

  // Evicting an empty key reports that nothing was held.
  assert.equal(registry.evict('match-progress:match-evict'), false);

  const ghost = registry.acquire('match-progress:match-evict', 'match progress heartbeat');
  assert.equal(ghost.acquired, true);
  assert.equal(registry.evict('match-progress:match-evict'), true);
  assert.equal(registry.getActiveCount(), 0);
  assert.equal(registry.getOwnerId('match-progress:match-evict'), null);

  // A fresh acquire succeeds immediately after the eviction (this is the steal path).
  const stealer = registry.acquire('match-progress:match-evict', 'match progress heartbeat');
  assert.equal(stealer.acquired, true);
  assert.notEqual(stealer.ownerId, ghost.ownerId);

  // The evicted owner's late release is ownerId-guarded — it cannot free the new owner.
  ghost.release();
  assert.equal(registry.getActiveCount(), 1);
  assert.equal(registry.getOwnerId('match-progress:match-evict'), stealer.ownerId);

  stealer.release();
  assert.equal(registry.getActiveCount(), 0);
});

test('keyed single-flight reuses in-flight work and guarantees cleanup', async () => {
  const registry = createKeyedSingleFlightRegistry();
  let callCount = 0;
  let resolveRequest: ((value: string) => void) | null = null;
  const task = () => {
    callCount += 1;
    return new Promise<string>((resolve) => {
      resolveRequest = resolve;
    });
  };

  const first = registry.run('match-progress:match-1', task);
  const duplicate = registry.run('match-progress:match-1', task);

  assert.equal(first.started, true);
  assert.equal(duplicate.started, false);
  assert.equal(callCount, 1);
  assert.equal(registry.getInFlightCount(), 1);

  assert.ok(resolveRequest);
  const resolveSingleFlight = resolveRequest as (value: string) => void;
  resolveSingleFlight('ok');
  assert.equal(await first.promise, 'ok');
  assert.equal(await duplicate.promise, 'ok');
  assert.equal(registry.getInFlightCount(), 0);
});

test('keyed single-flight cleans up rejected work', async () => {
  const registry = createKeyedSingleFlightRegistry();
  const failed = registry.run('match-progress:fail', () => Promise.reject(new Error('boom')));

  assert.equal(failed.started, true);
  await assert.rejects(failed.promise, /boom/);
  assert.equal(registry.getInFlightCount(), 0);

  const retried = registry.run('match-progress:fail', () => Promise.resolve('ok'));
  assert.equal(retried.started, true);
  assert.equal(await retried.promise, 'ok');
});

test('keyed single-flight evicts a stuck request after max age and starts fresh', async () => {
  const realPerformanceNow = globalThis.performance.now.bind(globalThis.performance);
  let clockMs = 1000;
  globalThis.performance.now = () => clockMs;

  try {
    const evictions: { key: string; ageMs: number }[] = [];
    const registry = createKeyedSingleFlightRegistry({
      maxInflightAgeMs: 12000,
      onEvictStale: ({ key, ageMs }) => {
        evictions.push({ key, ageMs });
      },
    });

    let callCount = 0;
    // A task whose promise NEVER settles — models the Android HTTP socket that hangs and
    // never rejects (the #203 inflight 고착).
    const neverSettlingTask = () => {
      callCount += 1;
      return new Promise<string>(() => {});
    };

    const first = registry.run('match-progress:stuck', neverSettlingTask);
    assert.equal(first.started, true);
    assert.equal(callCount, 1);
    assert.equal(registry.getInFlightCount(), 1);

    // BEFORE max age: a duplicate must coalesce onto the still-hung request (started:false),
    // exactly as before — healthy slow requests are not double-fired.
    clockMs += 11999;
    const beforeMaxAge = registry.run('match-progress:stuck', neverSettlingTask);
    assert.equal(beforeMaxAge.started, false);
    assert.equal(beforeMaxAge.promise, first.promise);
    assert.equal(callCount, 1);
    assert.equal(evictions.length, 0);

    // AFTER max age: the hung request is treated as abandoned and a FRESH request starts.
    clockMs += 2; // total age now > 12000ms
    const afterMaxAge = registry.run('match-progress:stuck', neverSettlingTask);
    assert.equal(afterMaxAge.started, true);
    assert.notEqual(afterMaxAge.promise, first.promise);
    assert.equal(callCount, 2);
    assert.equal(registry.getInFlightCount(), 1);
    assert.equal(evictions.length, 1);
    assert.equal(evictions[0].key, 'match-progress:stuck');
    assert.ok(evictions[0].ageMs >= 12000);
  } finally {
    globalThis.performance.now = realPerformanceNow;
  }
});

test('keyed single-flight: a settled stale promise does not drop the newer fresh entry', async () => {
  const realPerformanceNow = globalThis.performance.now.bind(globalThis.performance);
  let clockMs = 1000;
  globalThis.performance.now = () => clockMs;

  try {
    const registry = createKeyedSingleFlightRegistry({ maxInflightAgeMs: 12000 });

    // First request resolves on demand, but we hold it open past max age.
    let resolveStale: ((value: string) => void) | null = null;
    const stale = registry.run('match-progress:identity', () => new Promise<string>((resolve) => {
      resolveStale = resolve;
    }));
    assert.equal(stale.started, true);

    // Advance past max age and start a fresh request — this evicts + replaces the entry.
    clockMs += 12001;
    let resolveFresh: ((value: string) => void) | null = null;
    const fresh = registry.run('match-progress:identity', () => new Promise<string>((resolve) => {
      resolveFresh = resolve;
    }));
    assert.equal(fresh.started, true);
    assert.notEqual(fresh.promise, stale.promise);
    assert.equal(registry.getInFlightCount(), 1);

    // Now the ABANDONED stale promise finally settles. Its identity-guarded `.finally`
    // must NOT delete the newer entry.
    assert.ok(resolveStale);
    (resolveStale as (value: string) => void)('stale-late');
    assert.equal(await stale.promise, 'stale-late');
    assert.equal(registry.getInFlightCount(), 1, 'newer entry must survive the stale settle');

    // A duplicate while the fresh request is still in flight coalesces onto the fresh one.
    clockMs += 10;
    const dupOnFresh = registry.run('match-progress:identity', () => Promise.resolve('unused'));
    assert.equal(dupOnFresh.started, false);
    assert.equal(dupOnFresh.promise, fresh.promise);

    // When the fresh request settles, the entry clears normally.
    assert.ok(resolveFresh);
    (resolveFresh as (value: string) => void)('fresh-ok');
    assert.equal(await fresh.promise, 'fresh-ok');
    assert.equal(registry.getInFlightCount(), 0);
  } finally {
    globalThis.performance.now = realPerformanceNow;
  }
});

test('keyed single-flight defaults to no eviction (Infinity max age) for non-opted callers', async () => {
  const realPerformanceNow = globalThis.performance.now.bind(globalThis.performance);
  let clockMs = 1000;
  globalThis.performance.now = () => clockMs;

  try {
    // No maxInflightAgeMs passed — must preserve original behavior: an in-flight entry
    // blocks duplicates forever, never evicted, regardless of elapsed time.
    const registry = createKeyedSingleFlightRegistry();
    let callCount = 0;
    const neverSettlingTask = () => {
      callCount += 1;
      return new Promise<string>(() => {});
    };

    const first = registry.run('default-behavior', neverSettlingTask);
    assert.equal(first.started, true);

    clockMs += 60000; // a full minute later
    const duplicate = registry.run('default-behavior', neverSettlingTask);
    assert.equal(duplicate.started, false);
    assert.equal(duplicate.promise, first.promise);
    assert.equal(callCount, 1);
    assert.equal(registry.getInFlightCount(), 1);
  } finally {
    globalThis.performance.now = realPerformanceNow;
  }
});

test('keyed request registry reuses active request and ignores stale cleanup', () => {
  const registry = createKeyedRequestRegistry<{ generation: number; requestId: string }>();
  const first = registry.start('active-room:current-user/shared', () => ({
    generation: 1,
    requestId: 'first',
  }));
  const duplicate = registry.start('active-room:current-user/shared', () => ({
    generation: 2,
    requestId: 'second',
  }));

  assert.equal(first.started, true);
  assert.equal(duplicate.started, false);
  assert.deepEqual(duplicate.request, first.request);
  assert.equal(registry.getActiveCount(), 1);

  const staleDeleted = registry.deleteIf('active-room:current-user/shared', (request) => request.generation === 2);
  assert.equal(staleDeleted, false);
  assert.equal(registry.get('active-room:current-user/shared')?.requestId, 'first');

  const currentDeleted = registry.deleteIf('active-room:current-user/shared', (request) => request.generation === 1);
  assert.equal(currentDeleted, true);
  assert.equal(registry.getActiveCount(), 0);
});

test('keyed value registry ignores stale cleanup predicates', () => {
  const registry = createKeyedValueRegistry<{ generation: number; requestId: string }>();
  registry.set('active-room:current-user', {
    generation: 2,
    requestId: 'newer',
  });

  const staleDeleted = registry.deleteIf('active-room:current-user', (value) => value.generation === 1);
  assert.equal(staleDeleted, false);
  assert.deepEqual(registry.get('active-room:current-user'), {
    generation: 2,
    requestId: 'newer',
  });

  const currentDeleted = registry.deleteIf('active-room:current-user', (value) => value.generation === 2);
  assert.equal(currentDeleted, true);
  assert.equal(registry.get('active-room:current-user'), undefined);
});
