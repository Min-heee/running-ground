import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppStateStatus } from 'react-native';
import {
  createLocationTaskManager,
  type LocationTaskManagerAdapter,
} from '@/features/runs/tracking/background/locationTaskManagerCore';
import type { LocationTaskPolicy } from '@/features/runs/tracking/background/subscriptions';

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

function createFakeManagerAdapter() {
  const state = {
    marks: [] as string[],
    starts: [] as AppStateStatus[],
    stops: 0,
  };
  const startDeferred = createDeferred();
  const adapter: LocationTaskManagerAdapter = {
    startLocationTask: async (policy: LocationTaskPolicy) => {
      state.starts.push(policy.appState ?? 'active');
      await startDeferred.promise;
    },
    stopLocationTaskIfNeeded: async () => {
      state.stops += 1;
    },
    mark: (label) => {
      state.marks.push(label);
    },
    measureStart: () => () => 0,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };

  return {
    adapter,
    startDeferred,
    state,
  };
}

test('location task manager reuses same tracking key while start is in flight', async () => {
  const { adapter, startDeferred, state } = createFakeManagerAdapter();
  const manager = createLocationTaskManager(adapter);

  const firstStart = manager.startManagedLocationTask({ appState: 'active', trackingKey: 'match-1' });
  const secondStart = manager.startManagedLocationTask({ appState: 'active', trackingKey: 'match-1' });

  assert.equal(state.starts.length, 1);
  assert.ok(state.marks.includes('background task start skipped already starting'));

  startDeferred.resolve();
  await Promise.all([firstStart, secondStart]);
});

test('location task manager skips same tracking key after task is already started', async () => {
  const { adapter, startDeferred, state } = createFakeManagerAdapter();
  const manager = createLocationTaskManager(adapter);

  const firstStart = manager.startManagedLocationTask({ appState: 'background', trackingKey: 'match-1' });
  startDeferred.resolve();
  await firstStart;

  await manager.startManagedLocationTask({ appState: 'background', trackingKey: 'match-1' });

  assert.equal(state.starts.length, 1);
  assert.ok(state.marks.includes('background task start skipped already started'));
});

test('location task manager debounces app state sync to the latest state', async () => {
  const { adapter, startDeferred, state } = createFakeManagerAdapter();
  const manager = createLocationTaskManager(adapter);

  const firstSync = manager.syncManagedLocationTaskAppState('background', {
    debounceMs: 20,
    trackingKey: 'match-1',
  });
  const secondSync = manager.syncManagedLocationTaskAppState('active', {
    debounceMs: 1,
    trackingKey: 'match-1',
  });

  await firstSync;
  await new Promise((resolve) => {
    setTimeout(resolve, 5);
  });
  startDeferred.resolve();
  await secondSync;

  assert.deepEqual(state.starts, ['active']);
});

test('location task manager stop clears pending location source state', async () => {
  const { adapter, state } = createFakeManagerAdapter();
  const manager = createLocationTaskManager(adapter);

  const pendingSync = manager.syncManagedLocationTaskAppState('background', {
    debounceMs: 50,
    trackingKey: 'match-1',
  });

  await manager.stopManagedLocationTask();
  await pendingSync;

  assert.equal(state.stops, 1);
  assert.equal(state.starts.length, 0);
});

test('location task manager ignores a late start result after stop', async () => {
  const state = {
    starts: [] as AppStateStatus[],
    stops: 0,
  };
  const firstStart = createDeferred();
  const secondStart = createDeferred();
  const deferredStarts = [firstStart, secondStart];
  const adapter: LocationTaskManagerAdapter = {
    startLocationTask: async (policy: LocationTaskPolicy) => {
      state.starts.push(policy.appState ?? 'active');
      const deferred = deferredStarts[state.starts.length - 1];
      await deferred.promise;
    },
    stopLocationTaskIfNeeded: async () => {
      state.stops += 1;
    },
    mark: () => {},
    measureStart: () => () => 0,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  const manager = createLocationTaskManager(adapter);

  const pendingStart = manager.startManagedLocationTask({ appState: 'active', trackingKey: 'match-1' });
  await manager.stopManagedLocationTask();
  firstStart.resolve();
  await pendingStart;

  const restarted = manager.startManagedLocationTask({ appState: 'active', trackingKey: 'match-1' });
  secondStart.resolve();
  await restarted;

  assert.equal(state.stops, 1);
  assert.deepEqual(state.starts, ['active', 'active']);
});

test('location task manager cleanup allows the same match tracking key to start again', async () => {
  const state = {
    starts: [] as AppStateStatus[],
    stops: 0,
  };
  const adapter: LocationTaskManagerAdapter = {
    startLocationTask: async (policy: LocationTaskPolicy) => {
      state.starts.push(policy.appState ?? 'active');
    },
    stopLocationTaskIfNeeded: async () => {
      state.stops += 1;
    },
    mark: () => {},
    measureStart: () => () => 0,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  const manager = createLocationTaskManager(adapter);

  await manager.startManagedLocationTask({ appState: 'background', trackingKey: 'match-1' });
  await manager.stopManagedLocationTask();
  await manager.startManagedLocationTask({ appState: 'background', trackingKey: 'match-1' });

  assert.equal(state.stops, 1);
  assert.deepEqual(state.starts, ['background', 'background']);
});
