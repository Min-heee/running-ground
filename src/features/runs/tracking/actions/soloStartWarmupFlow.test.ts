import assert from 'node:assert/strict';
import test from 'node:test';
import {
  runSoloStartWarmupFlow,
  shouldRunSoloGpsWarmupCountdown,
} from '@/features/runs/tracking/actions/soloStartWarmupFlow';

test('solo GPS warmup countdown is used only for solo starts without match countdown warmup', () => {
  assert.equal(shouldRunSoloGpsWarmupCountdown('solo'), true);
  assert.equal(shouldRunSoloGpsWarmupCountdown('solo', { allowCountdownWarmup: true }), false);
  assert.equal(shouldRunSoloGpsWarmupCountdown('duel'), false);
  assert.equal(shouldRunSoloGpsWarmupCountdown('group'), false);
  assert.equal(shouldRunSoloGpsWarmupCountdown('room'), false);
});

test('solo warmup starts GPS before countdown and commits baseline after completion', async () => {
  const calls: string[] = [];
  const traceDetails: unknown[] = [];

  const completed = await runSoloStartWarmupFlow({
    startGpsWarmup: async () => {
      calls.push('start-gps-warmup');
    },
    runSoloStartCountdown: async () => {
      calls.push('countdown');
      return true;
    },
    commitWarmupBaseline: () => {
      calls.push('commit-baseline');
      return true;
    },
    resetWarmupTracking: async () => {
      calls.push('reset');
    },
    syncFromBackgroundTracking: () => {
      calls.push('sync');
    },
    endGpsStartTrace: (detail) => {
      calls.push('trace');
      traceDetails.push(detail);
    },
  });

  assert.equal(completed, true);
  assert.deepEqual(calls, [
    'start-gps-warmup',
    'countdown',
    'commit-baseline',
    'sync',
    'trace',
  ]);
  assert.deepEqual(traceDetails, [{ success: true, status: 'running', warmupMode: true }]);
});

test('solo warmup cancellation resets background tracking and does not commit baseline', async () => {
  const calls: string[] = [];
  const traceDetails: unknown[] = [];

  const completed = await runSoloStartWarmupFlow({
    startGpsWarmup: async () => {
      calls.push('start-gps-warmup');
    },
    runSoloStartCountdown: async () => {
      calls.push('countdown');
      return false;
    },
    commitWarmupBaseline: () => {
      calls.push('commit-baseline');
      return true;
    },
    resetWarmupTracking: async () => {
      calls.push('reset');
    },
    syncFromBackgroundTracking: () => {
      calls.push('sync');
    },
    endGpsStartTrace: (detail) => {
      calls.push('trace');
      traceDetails.push(detail);
    },
  });

  assert.equal(completed, false);
  assert.deepEqual(calls, [
    'start-gps-warmup',
    'countdown',
    'reset',
    'sync',
    'trace',
  ]);
  assert.deepEqual(traceDetails, [{ canceled: true, success: false }]);
});
