import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLocationTaskController,
  type LocationTaskControllerAdapter,
  type LocationTaskPlatform,
} from './locationTaskPolicy';
import {
  BACKGROUND_LOCATION_TASK_NAMES,
  BACKGROUND_RUN_TASK_NAME,
  LEGACY_BACKGROUND_RUN_TASK_NAME,
} from './locationTaskNames';

type FakeLocationState = {
  backgroundReady: boolean;
  backgroundStarted: boolean;
  backgroundStarts: number;
  backgroundStops: number;
  foregroundStarted: boolean;
  foregroundStarts: number;
  foregroundStops: number;
  operations: string[];
};

function createFakeLocationAdapter(platform: LocationTaskPlatform = 'android') {
  const state: FakeLocationState = {
    backgroundReady: true,
    backgroundStarted: false,
    backgroundStarts: 0,
    backgroundStops: 0,
    foregroundStarted: false,
    foregroundStarts: 0,
    foregroundStops: 0,
    operations: [],
  };

  const adapter: LocationTaskControllerAdapter = {
    platform,
    startForegroundLocationWatch: async () => {
      state.operations.push('start-foreground');
      if (!state.foregroundStarted) {
        state.foregroundStarted = true;
        state.foregroundStarts += 1;
      }
    },
    stopForegroundLocationWatch: () => {
      state.operations.push('stop-foreground');
      if (state.foregroundStarted) {
        state.foregroundStarted = false;
        state.foregroundStops += 1;
      }
    },
    startBackgroundLocationTaskIfNeeded: async () => {
      state.operations.push('start-background');
      if (!state.backgroundReady) {
        return false;
      }

      if (!state.backgroundStarted) {
        state.backgroundStarted = true;
        state.backgroundStarts += 1;
      }
      return true;
    },
    stopBackgroundLocationTasksIfNeeded: async () => {
      state.operations.push('stop-background');
      if (state.backgroundStarted) {
        state.backgroundStarted = false;
        state.backgroundStops += 1;
      }
    },
  };

  return {
    adapter,
    state,
  };
}

test('android active starts foreground once and clears any background task on repeated starts', async () => {
  const { adapter, state } = createFakeLocationAdapter('android');
  const controller = createLocationTaskController(adapter);

  await controller.startLocationTask({ appState: 'background' });
  assert.equal(state.backgroundStarted, true);
  assert.equal(state.foregroundStarted, false);

  await controller.startLocationTask({ appState: 'active' });
  await controller.startLocationTask({ appState: 'active' });

  assert.equal(state.foregroundStarted, true);
  assert.equal(state.backgroundStarted, false);
  assert.equal(state.foregroundStarts, 1);
  assert.equal(state.backgroundStarts, 1);
  assert.equal(state.backgroundStops, 1);
});

test('android active state never calls native background task start from a clean foreground run', async () => {
  const { adapter, state } = createFakeLocationAdapter('android');
  const controller = createLocationTaskController(adapter);

  await controller.startLocationTask({ appState: 'active' });

  assert.equal(state.foregroundStarted, true);
  assert.equal(state.backgroundStarted, false);
  assert.equal(state.backgroundStarts, 0);
  assert.equal(state.operations.includes('start-background'), false);
});

test('pause stop removes foreground watcher and stops background task', async () => {
  const { adapter, state } = createFakeLocationAdapter('ios');
  const controller = createLocationTaskController(adapter);

  await controller.startLocationTask({ appState: 'active' });
  assert.equal(state.foregroundStarted, true);
  assert.equal(state.backgroundStarted, true);

  await controller.stopLocationTaskIfNeeded();

  assert.equal(state.foregroundStarted, false);
  assert.equal(state.backgroundStarted, false);
  assert.equal(state.foregroundStops, 1);
  assert.equal(state.backgroundStops, 1);
  assert.deepEqual(state.operations.slice(-2), ['stop-foreground', 'stop-background']);
});

test('android background state does not start the same background task twice', async () => {
  const { adapter, state } = createFakeLocationAdapter('android');
  const controller = createLocationTaskController(adapter);

  await controller.startLocationTask({ appState: 'background' });
  await controller.startLocationTask({ appState: 'background' });

  assert.equal(state.backgroundStarted, true);
  assert.equal(state.foregroundStarted, false);
  assert.equal(state.backgroundStarts, 1);
  assert.equal(state.foregroundStarts, 0);
});

test('reset cleanup includes the current and legacy background task names', () => {
  assert.deepEqual(BACKGROUND_LOCATION_TASK_NAMES, [
    BACKGROUND_RUN_TASK_NAME,
    LEGACY_BACKGROUND_RUN_TASK_NAME,
  ]);
});

test('android app state changes do not leave foreground and background sources alive together', async () => {
  const { adapter, state } = createFakeLocationAdapter('android');
  const controller = createLocationTaskController(adapter);

  await controller.startLocationTask({ appState: 'active' });
  assert.equal(state.foregroundStarted, true);
  assert.equal(state.backgroundStarted, false);

  await controller.startLocationTask({ appState: 'background' });
  assert.equal(state.foregroundStarted, false);
  assert.equal(state.backgroundStarted, true);

  await controller.startLocationTask({ appState: 'active' });
  assert.equal(state.foregroundStarted, true);
  assert.equal(state.backgroundStarted, false);
  assert.equal(state.foregroundStarts, 2);
  assert.equal(state.backgroundStarts, 1);
  assert.equal(state.backgroundStops, 1);
});

test('android keeps foreground watcher if background task cannot start during inactive transition', async () => {
  const { adapter, state } = createFakeLocationAdapter('android');
  const controller = createLocationTaskController(adapter);

  await controller.startLocationTask({ appState: 'active' });
  state.backgroundReady = false;

  await controller.startLocationTask({ appState: 'inactive' });

  assert.equal(state.foregroundStarted, true);
  assert.equal(state.backgroundStarted, false);
  assert.equal(state.foregroundStops, 0);
});
