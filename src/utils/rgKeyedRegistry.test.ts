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
