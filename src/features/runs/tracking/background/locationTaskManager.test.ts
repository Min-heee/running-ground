import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppStateStatus } from 'react-native';
import {
  createLocationTaskManager,
  type LocationTaskManagerAdapter,
} from '@/features/runs/tracking/background/locationTaskManagerCore';
import {
  createLocationTaskController,
  type LocationTaskControllerAdapter,
} from '@/features/runs/tracking/background/locationTaskPolicy';
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
    measures: [] as string[],
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
    measureStart: (label) => {
      state.measures.push(label);
      return () => 0;
    },
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

test('location task manager traces active starts as foreground GPS and blocks background native start', async () => {
  const { adapter, startDeferred, state } = createFakeManagerAdapter();
  const manager = createLocationTaskManager(adapter);

  const start = manager.startManagedLocationTask({ appState: 'active', trackingKey: 'match-1' });

  assert.deepEqual(state.measures, ['GPS tracking start']);
  assert.ok(state.marks.includes('background task start blocked foreground'));

  startDeferred.resolve();
  await start;
});

test('location task manager active state starts both android foreground watch and background task', async () => {
  const operations: string[] = [];
  const locationAdapter: LocationTaskControllerAdapter = {
    platform: 'android',
    startForegroundLocationWatch: async () => {
      operations.push('start-foreground');
    },
    stopForegroundLocationWatch: () => {
      operations.push('stop-foreground');
    },
    startBackgroundLocationTaskIfNeeded: async () => {
      operations.push('start-background');
      return true;
    },
    stopBackgroundLocationTasksIfNeeded: async () => {
      operations.push('stop-background');
    },
  };
  const controller = createLocationTaskController(locationAdapter);
  const manager = createLocationTaskManager({
    startLocationTask: controller.startLocationTask,
    stopLocationTaskIfNeeded: controller.stopLocationTaskIfNeeded,
    mark: () => {},
    measureStart: () => () => 0,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });

  await manager.startManagedLocationTask({
    appState: 'active',
    trackingKey: 'duel:match-foreground',
  });

  assert.equal(operations.includes('start-foreground'), true);
  assert.deepEqual(operations, ['start-foreground', 'start-background']);
});

test('location task manager cancels detached active run without a tracking key before native call', async () => {
  const { adapter, state } = createFakeManagerAdapter();
  const manager = createLocationTaskManager(adapter);

  await manager.startManagedLocationTask({
    appState: 'active',
    detachLocationTask: true,
    trackingKey: null,
  });

  assert.equal(state.starts.length, 0);
  assert.ok(state.marks.includes('GPS tracking start detached from navigation'));
  assert.ok(state.marks.includes('background task start canceled before native call'));
});

test('location task manager ignores late background start after timeout', async () => {
  const { adapter, startDeferred, state } = createFakeManagerAdapter();
  const immediateTimeoutAdapter: LocationTaskManagerAdapter = {
    ...adapter,
    setTimeout: ((callback: () => void) => globalThis.setTimeout(callback, 0)) as typeof globalThis.setTimeout,
  };
  const manager = createLocationTaskManager(immediateTimeoutAdapter);

  await manager.startManagedLocationTask({ appState: 'background', trackingKey: 'match-1' });

  assert.ok(state.marks.includes('background task start timed out detached'));
  assert.deepEqual(state.starts, ['background']);

  startDeferred.resolve();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  assert.ok(state.marks.includes('background task start ignored stale appState'));
});

test('location task manager times out detached foreground GPS without blocking UI', async () => {
  const { adapter, startDeferred, state } = createFakeManagerAdapter();
  const immediateTimeoutAdapter: LocationTaskManagerAdapter = {
    ...adapter,
    setTimeout: ((callback: () => void) => globalThis.setTimeout(callback, 0)) as typeof globalThis.setTimeout,
  };
  const manager = createLocationTaskManager(immediateTimeoutAdapter);

  await manager.startManagedLocationTask({
    appState: 'active',
    detachLocationTask: true,
    trackingKey: 'duel:match-1',
  });
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  assert.deepEqual(state.starts, ['active']);
  assert.ok(state.marks.includes('GPS tracking start timed out non-blocking'));

  startDeferred.resolve();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  assert.ok(state.marks.includes('GPS result ignored without screen change'));
});

test('location task manager detached active GPS start returns before native start resolves', async () => {
  const { adapter, startDeferred, state } = createFakeManagerAdapter();
  const manager = createLocationTaskManager(adapter);

  await manager.startManagedLocationTask({
    appState: 'active',
    detachLocationTask: true,
    trackingKey: 'duel:match-detached-ui',
  });

  assert.deepEqual(state.starts, ['active']);
  assert.ok(state.marks.includes('GPS tracking start detached from navigation'));

  startDeferred.resolve();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
});

test('location task manager ignores stale background start after active foreground transition', async () => {
  const state = {
    marks: [] as string[],
    starts: [] as AppStateStatus[],
  };
  const backgroundStart = createDeferred();
  const activeStart = createDeferred();
  const adapter: LocationTaskManagerAdapter = {
    startLocationTask: async (policy: LocationTaskPolicy) => {
      const appState = policy.appState ?? 'active';
      state.starts.push(appState);
      await (appState === 'background' ? backgroundStart.promise : activeStart.promise);
    },
    stopLocationTaskIfNeeded: async () => {},
    mark: (label) => {
      state.marks.push(label);
    },
    measureStart: () => () => 0,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  const manager = createLocationTaskManager(adapter);

  const pendingBackgroundStart = manager.startManagedLocationTask({
    appState: 'background',
    trackingKey: 'duel:match-app-state',
  });
  await Promise.resolve();
  const foregroundStart = manager.startManagedLocationTask({
    appState: 'active',
    trackingKey: 'duel:match-app-state',
  });
  await Promise.resolve();

  assert.deepEqual(state.starts, ['background', 'active']);

  activeStart.resolve();
  await foregroundStart;
  backgroundStart.resolve();
  await pendingBackgroundStart;

  assert.ok(state.marks.includes('background task start ignored stale appState'));
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

test('location task manager single-flights detached active GPS start for the same match', async () => {
  const { adapter, startDeferred, state } = createFakeManagerAdapter();
  const manager = createLocationTaskManager(adapter);

  await manager.startManagedLocationTask({
    appState: 'active',
    detachLocationTask: true,
    trackingKey: 'duel:match-1',
  });
  await manager.startManagedLocationTask({
    appState: 'active',
    detachLocationTask: true,
    trackingKey: 'duel:match-1',
  });

  assert.equal(state.starts.length, 1);
  assert.ok(state.marks.includes('GPS tracking start detached from navigation'));
  assert.ok(state.marks.includes('background task start skipped already starting'));

  startDeferred.resolve();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
});
