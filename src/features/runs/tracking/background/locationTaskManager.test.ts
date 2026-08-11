import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppStateStatus } from 'react-native';
import {
  createLocationTaskManager,
  LOCATION_TASK_START_MAX_RETRIES_PER_GENERATION,
  LOCATION_TASK_START_RETRY_BACKOFF_MS,
  type LocationTaskManagerAdapter,
} from '@/features/runs/tracking/background/locationTaskManagerCore';
import {
  createLocationTaskController,
  type LocationTaskControllerAdapter,
} from '@/features/runs/tracking/background/locationTaskPolicy';
import type {
  LocationTaskPolicy,
  LocationTaskStartOutcome,
} from '@/features/runs/tracking/background/subscriptions';

const FULLY_ARMED_OUTCOME: LocationTaskStartOutcome = {
  fullyArmed: true,
  foregroundWatchActive: true,
  backgroundTaskStarted: true,
};

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
      return FULLY_ARMED_OUTCOME;
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

  // A sync only MODIFIES a generation an explicit start has claimed (TOCTOU zombie-arm guard),
  // so open the generation the way production always does before any app-state flip.
  startDeferred.resolve();
  await manager.startManagedLocationTask({ appState: 'background', trackingKey: 'match-1' });
  assert.deepEqual(state.starts, ['background']);

  const firstSync = manager.syncManagedLocationTaskAppState('background', {
    debounceMs: 20,
    trackingKey: 'match-1',
  });
  const secondSync = manager.syncManagedLocationTaskAppState('active', {
    debounceMs: 1,
    trackingKey: 'match-1',
  });

  await firstSync;
  await secondSync;

  // The superseded 'background' sync never re-armed; only the latest state ran.
  assert.deepEqual(state.starts, ['background', 'active']);
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
      return true;
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
      return FULLY_ARMED_OUTCOME;
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
      return FULLY_ARMED_OUTCOME;
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
      return FULLY_ARMED_OUTCOME;
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

// ---------------------------------------------------------------------------------------------
// Silent retry engine — every test below runs on an INJECTED fake clock (adapter.setTimeout /
// clearTimeout), never real timers or Date.now(), so a reverted fix fails these deterministically
// (this repo has had a reverted fix pass 95% of runs on real-clock millisecond overlap).
// ---------------------------------------------------------------------------------------------

function createFakeClock() {
  let nowMs = 0;
  let nextTimerId = 1;
  const timers = new Map<number, { dueAtMs: number; callback: () => void }>();

  const drainMicrotasks = async () => {
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }
  };

  return {
    setTimeout: ((callback: () => void, delayMs: number) => {
      const timerId = nextTimerId;
      nextTimerId += 1;
      timers.set(timerId, { dueAtMs: nowMs + delayMs, callback });
      return timerId as unknown as ReturnType<typeof setTimeout>;
    }) as typeof globalThis.setTimeout,
    clearTimeout: ((timerId: unknown) => {
      timers.delete(timerId as number);
    }) as typeof globalThis.clearTimeout,
    drain: drainMicrotasks,
    async advance(deltaMs: number) {
      const targetMs = nowMs + deltaMs;
      // Fire due timers in due-time order; timers scheduled BY a fired callback join the pass
      // when they fall inside the window (backoff cascades run to completion in one advance).
      for (;;) {
        const dueEntry = [...timers.entries()]
          .filter(([, timer]) => timer.dueAtMs <= targetMs)
          .sort(([, a], [, b]) => a.dueAtMs - b.dueAtMs)[0];
        if (!dueEntry) {
          break;
        }
        timers.delete(dueEntry[0]);
        nowMs = Math.max(nowMs, dueEntry[1].dueAtMs);
        dueEntry[1].callback();
        await drainMicrotasks();
      }
      nowMs = targetMs;
    },
    pendingTimerCount: () => timers.size,
  };
}

type ScriptedStartStep = 'ok' | 'partial' | 'reject' | 'hang';

function createScriptedManagerAdapter(
  script: ScriptedStartStep[],
  overrides?: Partial<LocationTaskManagerAdapter>,
) {
  const clock = createFakeClock();
  const state = {
    marks: [] as string[],
    starts: [] as { appState: AppStateStatus; allowUserSettingsDialog: boolean | undefined }[],
    stops: 0,
  };
  const hangResolvers: {
    resolve: (outcome: LocationTaskStartOutcome) => void;
    reject: (error: Error) => void;
  }[] = [];
  const adapter: LocationTaskManagerAdapter = {
    startLocationTask: async (policy: LocationTaskPolicy) => {
      state.starts.push({
        appState: policy.appState ?? 'active',
        allowUserSettingsDialog: policy.allowUserSettingsDialog,
      });
      const step = script[state.starts.length - 1] ?? 'ok';
      if (step === 'reject') {
        throw new Error('native start rejected');
      }
      if (step === 'hang') {
        return new Promise<LocationTaskStartOutcome>((resolve, reject) => {
          hangResolvers.push({ resolve, reject });
        });
      }
      if (step === 'partial') {
        return { fullyArmed: false, foregroundWatchActive: true, backgroundTaskStarted: false };
      }
      return FULLY_ARMED_OUTCOME;
    },
    stopLocationTaskIfNeeded: async () => {
      state.stops += 1;
    },
    mark: (label) => {
      state.marks.push(label);
    },
    measureStart: () => () => 0,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    ...overrides,
  };

  return { adapter, clock, state, hangResolvers };
}

test('retry tuning constants stay pinned', () => {
  assert.deepEqual([...LOCATION_TASK_START_RETRY_BACKOFF_MS], [2_000, 5_000, 15_000, 45_000]);
  assert.equal(LOCATION_TASK_START_MAX_RETRIES_PER_GENERATION, 8);
});

test('a partially armed start no longer records the task key — same-key restart reaches the adapter', async () => {
  const { adapter, clock, state } = createScriptedManagerAdapter(['partial', 'ok']);
  const manager = createLocationTaskManager(adapter);

  await manager.startManagedLocationTask({ appState: 'background', trackingKey: 'match-1' });

  assert.equal(state.starts.length, 1);
  assert.ok(state.marks.includes('location task start incomplete'));

  await manager.startManagedLocationTask({ appState: 'background', trackingKey: 'match-1' });
  assert.equal(state.starts.length, 2);

  // The recovered start recorded the key honestly: a third same-key start dedupes again.
  await manager.startManagedLocationTask({ appState: 'background', trackingKey: 'match-1' });
  assert.equal(state.starts.length, 2);
  assert.ok(state.marks.includes('background task start skipped already started'));

  await clock.advance(600_000);
  assert.equal(state.starts.length, 2);
});

test('silent retry series re-arms on backoff, suppresses the settings dialog, and ends on success', async () => {
  const { adapter, clock, state } = createScriptedManagerAdapter(['partial', 'partial', 'ok']);
  const manager = createLocationTaskManager(adapter);

  await manager.startManagedLocationTask({ appState: 'active', trackingKey: 'match-1' });
  assert.equal(state.starts.length, 1);

  await clock.advance(1_999);
  assert.equal(state.starts.length, 1);
  await clock.advance(1);
  assert.equal(state.starts.length, 2);

  await clock.advance(4_999);
  assert.equal(state.starts.length, 2);
  await clock.advance(1);
  assert.equal(state.starts.length, 3);

  // Invariant: only the user-intent series opener may show the Android settings dialog.
  assert.equal(state.starts[0].allowUserSettingsDialog, true);
  assert.equal(state.starts[1].allowUserSettingsDialog, false);
  assert.equal(state.starts[2].allowUserSettingsDialog, false);

  // Success ends the series (no zombie retries) and records the key honestly.
  await clock.advance(600_000);
  assert.equal(state.starts.length, 3);
  assert.equal(clock.pendingTimerCount(), 0);
  await manager.startManagedLocationTask({ appState: 'active', trackingKey: 'match-1' });
  assert.equal(state.starts.length, 3);
  assert.ok(state.marks.includes('background task start skipped already started'));
});

test('a retry series is bounded: one explicit attempt plus four backoff retries, then exhausted', async () => {
  const { adapter, clock, state } = createScriptedManagerAdapter(
    ['partial', 'partial', 'partial', 'partial', 'partial', 'partial'],
  );
  const manager = createLocationTaskManager(adapter);

  await manager.startManagedLocationTask({ appState: 'active', trackingKey: 'match-1' });
  await clock.advance(600_000);

  assert.equal(state.starts.length, 1 + LOCATION_TASK_START_RETRY_BACKOFF_MS.length);
  assert.equal(clock.pendingTimerCount(), 0);
  assert.ok(state.marks.includes('location task start retries exhausted'));
});

test('the per-generation budget caps silent retries at 8 and resets on stop', async () => {
  const script = Array.from({ length: 16 }, () => 'partial' as const);
  const { adapter, clock, state } = createScriptedManagerAdapter(script);
  const manager = createLocationTaskManager(adapter);

  await manager.startManagedLocationTask({ appState: 'active', trackingKey: 'match-1' });
  await clock.advance(600_000);
  await manager.startManagedLocationTask({ appState: 'active', trackingKey: 'match-2' });
  await clock.advance(600_000);
  await manager.startManagedLocationTask({ appState: 'active', trackingKey: 'match-3' });
  await clock.advance(600_000);

  const scheduledMarks = state.marks.filter((mark) => mark === 'location task start retry scheduled');
  assert.equal(scheduledMarks.length, LOCATION_TASK_START_MAX_RETRIES_PER_GENERATION);
  assert.equal(state.starts.length, 11); // 3 explicit + 8 budgeted silent retries

  // stop → generation bump → fresh budget: the next run's failed start retries again.
  await manager.stopManagedLocationTask();
  await manager.startManagedLocationTask({ appState: 'active', trackingKey: 'match-4' });
  await clock.advance(2_000);
  assert.equal(state.starts.length, 13);
});

test('stopManagedLocationTask kills the pending silent retry', async () => {
  const { adapter, clock, state } = createScriptedManagerAdapter(['partial', 'ok']);
  const manager = createLocationTaskManager(adapter);

  await manager.startManagedLocationTask({ appState: 'active', trackingKey: 'match-1' });
  assert.equal(state.starts.length, 1);

  await manager.stopManagedLocationTask();
  await clock.advance(600_000);

  assert.equal(state.starts.length, 1);
  assert.equal(state.stops, 1);
});

test('a pending retry that survives clearTimeout still dies on the generation bump', async () => {
  const { adapter, clock, state } = createScriptedManagerAdapter(['partial', 'ok'], {
    clearTimeout: (() => {}) as typeof globalThis.clearTimeout,
  });
  const manager = createLocationTaskManager(adapter);

  await manager.startManagedLocationTask({ appState: 'active', trackingKey: 'match-1' });
  assert.equal(state.starts.length, 1);

  await manager.stopManagedLocationTask();
  // clearTimeout was a no-op, so the retry timer actually FIRES — the generation check alone
  // must refuse the stale retry (the cancellation authority the warmup backstops rely on).
  await clock.advance(600_000);

  assert.equal(state.starts.length, 1);
});

test('an explicit start supersedes the pending silent retry — no stale-options re-arm later', async () => {
  const { adapter, clock, state } = createScriptedManagerAdapter(['partial', 'ok']);
  const manager = createLocationTaskManager(adapter);

  await manager.startManagedLocationTask({ appState: 'active', trackingKey: 'match-1' });
  assert.equal(state.starts.length, 1);

  // Before the 2s retry fires, an app-state-intent start commits with fresh options.
  await manager.startManagedLocationTask({ appState: 'background', trackingKey: 'match-1' });
  assert.equal(state.starts.length, 2);
  assert.equal(state.starts[1].appState, 'background');
  assert.equal(state.starts[1].allowUserSettingsDialog, true);

  await clock.advance(600_000);
  assert.equal(state.starts.length, 2); // the stale 'active' retry never fires
});

test('a rejected start still rejects for awaited callers and opens a silent retry series', async () => {
  const { adapter, clock, state } = createScriptedManagerAdapter(['reject', 'ok']);
  const manager = createLocationTaskManager(adapter);

  await assert.rejects(
    manager.startManagedLocationTask({ appState: 'active', trackingKey: 'match-1' }),
    /native start rejected/,
  );
  assert.equal(state.starts.length, 1);

  await clock.advance(2_000);
  assert.equal(state.starts.length, 2);
  assert.equal(state.starts[1].allowUserSettingsDialog, false);

  await manager.startManagedLocationTask({ appState: 'active', trackingKey: 'match-1' });
  assert.equal(state.starts.length, 2);
  assert.ok(state.marks.includes('background task start skipped already started'));
});

test('a rejected detached start is swallowed and still opens a silent retry series', async () => {
  const { adapter, clock, state } = createScriptedManagerAdapter(['reject', 'ok']);
  const manager = createLocationTaskManager(adapter);

  await manager.startManagedLocationTask({
    appState: 'active',
    detachLocationTask: true,
    trackingKey: 'duel:match-1',
  });
  await clock.drain();
  assert.equal(state.starts.length, 1);

  await clock.advance(2_000);
  assert.equal(state.starts.length, 2);
  assert.equal(clock.pendingTimerCount(), 0);
});

test('a timed-out start schedules no retry while unsettled, and a late SUCCESS stays ignored', async () => {
  const { adapter, clock, state, hangResolvers } = createScriptedManagerAdapter(['hang', 'ok']);
  const manager = createLocationTaskManager(adapter);

  const pendingStart = manager.startManagedLocationTask({ appState: 'background', trackingKey: 'match-1' });
  await clock.drain();
  assert.equal(state.starts.length, 1);

  await clock.advance(3_000);
  await pendingStart;
  assert.ok(state.marks.includes('background task start timed out detached'));

  // A still-hung op has settled nothing — no retry series opens.
  await clock.advance(600_000);
  assert.equal(state.starts.length, 1);
  assert.equal(clock.pendingTimerCount(), 0);

  hangResolvers[0].resolve(FULLY_ARMED_OUTCOME);
  await clock.drain();
  assert.ok(state.marks.includes('background task start ignored stale appState'));

  // Late success: pipeline armed natively, no retry needed — and the key stayed unrecorded, so
  // an explicit restart still reaches the adapter (no dedupe against the ignored result).
  await clock.advance(600_000);
  assert.equal(state.starts.length, 1);
  await manager.startManagedLocationTask({ appState: 'background', trackingKey: 'match-1' });
  assert.equal(state.starts.length, 2);
});

test('a timed-out start whose op later settles PARTIAL opens the silent retry series', async () => {
  const { adapter, clock, state, hangResolvers } = createScriptedManagerAdapter(['hang', 'ok']);
  const manager = createLocationTaskManager(adapter);

  const pendingStart = manager.startManagedLocationTask({ appState: 'background', trackingKey: 'match-1' });
  await clock.drain();
  await clock.advance(3_000);
  await pendingStart;
  assert.ok(state.marks.includes('background task start timed out detached'));
  assert.equal(state.starts.length, 1);

  // The real-world hang shape: the background module's own 3s cap resolves FALSE after the
  // manager race already expired (bg-module timeout starts later than the manager's).
  hangResolvers[0].resolve({ fullyArmed: false, foregroundWatchActive: true, backgroundTaskStarted: false });
  await clock.drain();
  assert.ok(state.marks.includes('location task start retry scheduled'));

  await clock.advance(2_000);
  assert.equal(state.starts.length, 2);
  assert.equal(state.starts[1].allowUserSettingsDialog, false);

  // The recovered start recorded the key honestly.
  await manager.startManagedLocationTask({ appState: 'background', trackingKey: 'match-1' });
  assert.equal(state.starts.length, 2);
  assert.ok(state.marks.includes('background task start skipped already started'));
});

test('a late settle whose slot belongs to a DIFFERENT key schedules no retry (slot guard)', async () => {
  const { adapter, clock, state, hangResolvers } = createScriptedManagerAdapter(['hang', 'hang']);
  const manager = createLocationTaskManager(adapter);

  const firstStart = manager.startManagedLocationTask({ appState: 'background', trackingKey: 'match-1' });
  await clock.drain();
  await clock.advance(3_000); // first start times out; its hung op keeps the slot for now
  await firstStart;
  assert.equal(state.starts.length, 1);

  // A different-key start commits and hangs — the slot now belongs to it.
  const secondStart = manager.startManagedLocationTask({ appState: 'background', trackingKey: 'match-2' });
  await clock.drain();
  assert.equal(state.starts.length, 2);

  // The FIRST op finally settles as a failure — but its slot tenure is over, so the late-settle
  // heal must refuse: a retry here would carry match-1's stale options into match-2's series.
  hangResolvers[0].resolve({ fullyArmed: false, foregroundWatchActive: true, backgroundTaskStarted: false });
  await clock.drain();
  assert.ok(!state.marks.includes('location task start retry scheduled'));

  await clock.advance(3_000); // the second start's own race times out
  await secondStart;
  hangResolvers[1].resolve(FULLY_ARMED_OUTCOME);
  await clock.drain();
  await clock.advance(600_000);
  assert.ok(!state.marks.includes('location task start retry scheduled'));
  assert.equal(state.starts.length, 2);
  assert.equal(clock.pendingTimerCount(), 0);
});

test('a late REJECT whose slot belongs to a different key schedules no retry (slot guard)', async () => {
  const { adapter, clock, state, hangResolvers } = createScriptedManagerAdapter(['hang', 'hang']);
  const manager = createLocationTaskManager(adapter);

  const firstStart = manager.startManagedLocationTask({ appState: 'background', trackingKey: 'match-1' });
  await clock.drain();
  await clock.advance(3_000);
  await firstStart;

  const secondStart = manager.startManagedLocationTask({ appState: 'background', trackingKey: 'match-2' });
  await clock.drain();
  assert.equal(state.starts.length, 2);

  hangResolvers[0].reject(new Error('late native failure'));
  await clock.drain();
  assert.ok(!state.marks.includes('location task start retry scheduled'));

  await clock.advance(3_000);
  await secondStart;
  hangResolvers[1].resolve(FULLY_ARMED_OUTCOME);
  await clock.drain();
  await clock.advance(600_000);
  assert.ok(!state.marks.includes('location task start retry scheduled'));
  assert.equal(clock.pendingTimerCount(), 0);
});

test('a timed-out start whose op later REJECTS opens the silent retry series', async () => {
  const { adapter, clock, state, hangResolvers } = createScriptedManagerAdapter(['hang', 'ok']);
  const manager = createLocationTaskManager(adapter);

  const pendingStart = manager.startManagedLocationTask({ appState: 'background', trackingKey: 'match-1' });
  await clock.drain();
  await clock.advance(3_000);
  await pendingStart;
  assert.equal(state.starts.length, 1);

  hangResolvers[0].reject(new Error('late native failure'));
  await clock.drain();
  assert.ok(state.marks.includes('location task start retry scheduled'));

  await clock.advance(2_000);
  assert.equal(state.starts.length, 2);
  assert.equal(clock.pendingTimerCount(), 0);
});

// ---------------------------------------------------------------------------------------------
// TOCTOU zombie GPS arm (적대 검증 2026-08-11) — resetBackgroundRunTracking's stop bumps the
// generation synchronously, then awaits the native stop for 100s of ms (Android multi-task
// loop). An AppState sync minted DURING that window carries the LIVE post-bump generation, so
// the generation check alone can never refuse it — it used to arm a foreground watch + Android
// FGS for a run that no longer exists, and nothing reaped it (the abandoned reaper ignores idle
// snapshots). The manager-level invariant pinned here: an appState sync is a MODIFIER of a
// generation someone has explicitly started, never an initiator.
// ---------------------------------------------------------------------------------------------

test('appState sync minted during an awaited stop arms nothing — the dead session stays dead', async () => {
  // Model the slow native stop: it settles only after the sync debounce has already fired.
  let resolveNativeStop!: () => void;
  const nativeStopGate = new Promise<void>((resolve) => {
    resolveNativeStop = resolve;
  });
  const { adapter, clock, state } = createScriptedManagerAdapter(['ok', 'ok'], {
    stopLocationTaskIfNeeded: async () => {
      await nativeStopGate;
    },
  });
  const manager = createLocationTaskManager(adapter);

  await manager.startManagedLocationTask({ appState: 'active', trackingKey: 'match-1' });
  assert.equal(state.starts.length, 1);

  // Reset begins: the generation bump is synchronous, the native stop is now in flight.
  const stopPromise = manager.stopManagedLocationTask();
  // The hook's app-state debounce fires inside the window — the React trackerStatusRef and the
  // module snapshot both still read 'running' there, so the intent reaches the manager.
  const syncPromise = manager.syncManagedLocationTaskAppState('background', { trackingKey: 'match-1' });

  // The manager's own 500ms debounce elapses while the native stop is STILL in flight.
  await clock.advance(500);
  resolveNativeStop();
  await stopPromise;
  await syncPromise;
  await clock.advance(600_000);

  assert.equal(state.starts.length, 1);
  assert.equal(clock.pendingTimerCount(), 0);
});

test('appState sync still re-arms a live generation that has start intent', async () => {
  const { adapter, clock, state } = createScriptedManagerAdapter(['ok', 'ok']);
  const manager = createLocationTaskManager(adapter);

  await manager.startManagedLocationTask({ appState: 'active', trackingKey: 'match-1' });
  const syncPromise = manager.syncManagedLocationTaskAppState('background', { trackingKey: 'match-1' });
  await clock.advance(500);
  await syncPromise;

  assert.deepEqual(state.starts.map((start) => start.appState), ['active', 'background']);
});

test('a detached foreground start that cancels before the native call still claims the generation', async () => {
  const { adapter, clock, state } = createScriptedManagerAdapter(['ok']);
  const manager = createLocationTaskManager(adapter);

  // Android detached flow: foreground-active + detach + no trackingKey cancels before the
  // native call on purpose — the background arm is DEFERRED to the app-state sync, which must
  // therefore not be refused as ownerless.
  await manager.startManagedLocationTask({ appState: 'active', detachLocationTask: true });
  await clock.drain();
  assert.equal(state.starts.length, 0);

  const syncPromise = manager.syncManagedLocationTaskAppState('background');
  await clock.advance(500);
  await syncPromise;

  assert.deepEqual(state.starts.map((start) => start.appState), ['background']);
});
