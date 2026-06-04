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

test('android keeps both the foreground watch and background task running', async () => {
  const { adapter, state } = createFakeLocationAdapter('android');
  const controller = createLocationTaskController(adapter);

  await controller.startLocationTask({ appState: 'background' });
  assert.equal(state.backgroundStarted, true);
  assert.equal(state.foregroundStarted, true);

  await controller.startLocationTask({ appState: 'active' });
  await controller.startLocationTask({ appState: 'active' });

  assert.equal(state.foregroundStarted, true);
  assert.equal(state.backgroundStarted, true);
  assert.equal(state.foregroundStarts, 1);
  assert.equal(state.backgroundStarts, 1);
  assert.equal(state.backgroundStops, 0);
  assert.equal(state.foregroundStops, 0);
});

test('android active state starts both foreground watch and background task from a clean run', async () => {
  const { adapter, state } = createFakeLocationAdapter('android');
  const controller = createLocationTaskController(adapter);

  await controller.startLocationTask({ appState: 'active' });

  assert.equal(state.foregroundStarted, true);
  assert.equal(state.backgroundStarted, true);
  assert.equal(state.foregroundStarts, 1);
  assert.equal(state.backgroundStarts, 1);
  assert.equal(state.operations.includes('start-foreground'), true);
  assert.equal(state.operations.includes('start-background'), true);
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

test('android does not start the same sources twice on repeated starts', async () => {
  const { adapter, state } = createFakeLocationAdapter('android');
  const controller = createLocationTaskController(adapter);

  await controller.startLocationTask({ appState: 'background' });
  await controller.startLocationTask({ appState: 'background' });

  assert.equal(state.backgroundStarted, true);
  assert.equal(state.foregroundStarted, true);
  assert.equal(state.backgroundStarts, 1);
  assert.equal(state.foregroundStarts, 1);
});

test('reset cleanup includes the current and legacy background task names', () => {
  assert.deepEqual(BACKGROUND_LOCATION_TASK_NAMES, [
    BACKGROUND_RUN_TASK_NAME,
    LEGACY_BACKGROUND_RUN_TASK_NAME,
  ]);
});

test('android keeps both foreground and background sources alive across app state changes', async () => {
  const { adapter, state } = createFakeLocationAdapter('android');
  const controller = createLocationTaskController(adapter);

  await controller.startLocationTask({ appState: 'active' });
  assert.equal(state.foregroundStarted, true);
  assert.equal(state.backgroundStarted, true);

  await controller.startLocationTask({ appState: 'background' });
  assert.equal(state.foregroundStarted, true);
  assert.equal(state.backgroundStarted, true);

  await controller.startLocationTask({ appState: 'active' });
  assert.equal(state.foregroundStarted, true);
  assert.equal(state.backgroundStarted, true);
  assert.equal(state.foregroundStarts, 1);
  assert.equal(state.backgroundStarts, 1);
  assert.equal(state.backgroundStops, 0);
  assert.equal(state.foregroundStops, 0);
});

test('android still starts the foreground watch even if the background task cannot start', async () => {
  const { adapter, state } = createFakeLocationAdapter('android');
  const controller = createLocationTaskController(adapter);

  await controller.startLocationTask({ appState: 'active' });
  assert.equal(state.backgroundStarted, true);

  state.backgroundReady = false;
  await controller.stopLocationTaskIfNeeded();

  await controller.startLocationTask({ appState: 'inactive' });

  // Foreground watch is independent of the background task: in-app GPS keeps
  // working even when the background foreground-service task fails to start.
  assert.equal(state.foregroundStarted, true);
  assert.equal(state.backgroundStarted, false);
});
