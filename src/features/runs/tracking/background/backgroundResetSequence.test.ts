import assert from 'node:assert/strict';
import test from 'node:test';
import {
  runBackgroundResetSequence,
  type BackgroundResetSequenceSteps,
} from '@/features/runs/tracking/background/backgroundResetSequence';

// TOCTOU zombie GPS (적대 검증 2026-08-11) — these tests pin the ORDER of the reset teardown,
// because the order is the fix: the public snapshot must read idle before the native stop is
// awaited, or the AppState debounce firing inside that window passes the 'running' status gate
// and arms GPS for a dead run. A reverted reorder fails the first assertion deterministically —
// no real timers, no clock at all: the pin is "what already ran before the stop's await".

function createOrderedSteps(previousMatchId: string | null) {
  const order: string[] = [];
  let resolveNativeStop!: () => void;
  const nativeStopGate = new Promise<void>((resolve) => {
    resolveNativeStop = resolve;
  });
  const steps: BackgroundResetSequenceSteps = {
    stopPersistence: () => {
      order.push('stop-persistence');
      return previousMatchId;
    },
    resetTrackingStateOnly: () => {
      order.push('reset-state');
    },
    emitSnapshot: () => {
      order.push('emit');
    },
    stopManagedLocationTask: () => {
      order.push('native-stop-begins');
      return nativeStopGate;
    },
    clearPersistedSnapshot: async (matchId) => {
      order.push(`clear-persisted:${matchId}`);
    },
    clearGoalFreeze: (matchId) => {
      order.push(`clear-freeze:${matchId}`);
    },
  };

  return { order, resolveNativeStop, steps };
}

test('reset flips public state to idle synchronously, before the awaited native stop', async () => {
  const { order, resolveNativeStop, steps } = createOrderedSteps('match-1');

  const sequencePromise = runBackgroundResetSequence(steps);

  // The native stop is STILL in flight here — this is exactly the TOCTOU window. The state wipe
  // and its emission must ALREADY have happened, so every status-gated consumer (the AppState
  // sync above all) sees idle for the window's whole duration.
  assert.deepEqual(order, ['stop-persistence', 'reset-state', 'emit', 'native-stop-begins']);

  resolveNativeStop();
  await sequencePromise;

  assert.deepEqual(order, [
    'stop-persistence',
    'reset-state',
    'emit',
    'native-stop-begins',
    'clear-persisted:match-1',
    'clear-freeze:match-1',
  ]);
});

test('reset without an active persistence match still clears storage but never the goal freeze', async () => {
  const { order, resolveNativeStop, steps } = createOrderedSteps(null);

  const sequencePromise = runBackgroundResetSequence(steps);
  resolveNativeStop();
  await sequencePromise;

  assert.deepEqual(order, [
    'stop-persistence',
    'reset-state',
    'emit',
    'native-stop-begins',
    'clear-persisted:null',
  ]);
});
