import assert from 'node:assert/strict';
import test from 'node:test';
import type { UpdateRunningMatchProgressInput } from '@/lib/api/types';
import {
  BACKGROUND_MATCH_PROGRESS_SYNC_INTERVAL_MS,
  clearBackgroundMatchProgressContext,
  flushBackgroundMatchProgressSync,
  getBackgroundMatchProgressContext,
  resetBackgroundMatchProgressSyncForTest,
  setBackgroundMatchProgressContext,
} from '@/features/runs/tracking/background/backgroundMatchProgressSync';
import {
  INITIAL_SNAPSHOT,
  setSnapshotState,
} from '@/features/runs/tracking/background/snapshotStore';

function setRunningSnapshot(nowMs: number, overrides?: Partial<typeof INITIAL_SNAPSHOT>) {
  setSnapshotState({
    ...INITIAL_SNAPSHOT,
    status: 'running',
    startedAt: new Date(nowMs - 12_000).toISOString(),
    distanceKm: 0.42,
    currentPace: '05:12/km',
    ...overrides,
  });
}

test('background match progress sync skips without an active match context', async () => {
  const nowMs = Date.now();
  resetBackgroundMatchProgressSyncForTest();
  setRunningSnapshot(nowMs);

  const calls: UpdateRunningMatchProgressInput[] = [];
  const didFlush = await flushBackgroundMatchProgressSync({
    isAppBackground: true,
    nowMs,
    updateRunningMatchProgress: async (input) => {
      calls.push(input);
    },
  });

  assert.equal(didFlush, false);
  assert.equal(calls.length, 0);
});

test('background match progress sync skips while app is active', async () => {
  const nowMs = Date.now();
  resetBackgroundMatchProgressSyncForTest();
  setRunningSnapshot(nowMs);
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-1',
    mode: 'duel',
    distanceKm: 5,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  const calls: UpdateRunningMatchProgressInput[] = [];
  const didFlush = await flushBackgroundMatchProgressSync({
    isAppBackground: false,
    nowMs,
    updateRunningMatchProgress: async (input) => {
      calls.push(input);
    },
  });

  assert.equal(didFlush, false);
  assert.equal(calls.length, 0);
});

test('background match progress sync uploads the latest snapshot while backgrounded', async () => {
  const nowMs = Date.now();
  resetBackgroundMatchProgressSyncForTest();
  setRunningSnapshot(nowMs);
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-2',
    mode: 'duel',
    distanceKm: 5,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  const calls: UpdateRunningMatchProgressInput[] = [];
  const didFlush = await flushBackgroundMatchProgressSync({
    isAppBackground: true,
    nowMs,
    updateRunningMatchProgress: async (input) => {
      calls.push(input);
    },
  });

  assert.equal(didFlush, true);
  assert.deepEqual(calls, [{
    matchId: 'duel-match-2',
    distanceKm: 0.42,
    elapsedSeconds: 12,
    currentPace: '05:12/km',
    status: 'background',
  }]);
});

test('background match progress sync throttles repeated background location batches', async () => {
  const nowMs = Date.now();
  resetBackgroundMatchProgressSyncForTest();
  setRunningSnapshot(nowMs);
  setBackgroundMatchProgressContext({
    matchId: 'group-match-1',
    mode: 'group',
    distanceKm: 3,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  const calls: UpdateRunningMatchProgressInput[] = [];
  const updateRunningMatchProgress = async (input: UpdateRunningMatchProgressInput) => {
    calls.push(input);
  };

  assert.equal(await flushBackgroundMatchProgressSync({
    isAppBackground: true,
    nowMs,
    updateRunningMatchProgress,
  }), true);
  assert.equal(await flushBackgroundMatchProgressSync({
    isAppBackground: true,
    nowMs: nowMs + 1_000,
    updateRunningMatchProgress,
  }), false);
  assert.equal(await flushBackgroundMatchProgressSync({
    isAppBackground: true,
    nowMs: nowMs + BACKGROUND_MATCH_PROGRESS_SYNC_INTERVAL_MS,
    updateRunningMatchProgress,
  }), true);
  assert.equal(calls.length, 2);
});

test('background match progress sync clears only the active context match when requested', () => {
  resetBackgroundMatchProgressSyncForTest();
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-keep',
    mode: 'duel',
    distanceKm: 5,
    slotStartAt: null,
  });

  clearBackgroundMatchProgressContext('duel-match-other');
  assert.equal(getBackgroundMatchProgressContext()?.matchId, 'duel-match-keep');

  clearBackgroundMatchProgressContext('duel-match-keep');
  assert.equal(getBackgroundMatchProgressContext(), null);
});
