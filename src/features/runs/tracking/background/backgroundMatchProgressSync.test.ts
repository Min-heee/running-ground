import assert from 'node:assert/strict';
import test from 'node:test';
import type { UpdateRunningMatchProgressInput } from '@/lib/api/types';
import {
  BACKGROUND_MATCH_PROGRESS_INFLIGHT_STALE_MS,
  BACKGROUND_MATCH_PROGRESS_SYNC_INTERVAL_MS,
  clearBackgroundMatchProgressContext,
  flushBackgroundMatchProgressSync,
  getBackgroundMatchProgressContext,
  isBackgroundMatchProgressInFlightStale,
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
    status: 'running',
  }]);
});

test('background match progress sync uses native upload on android when available', async () => {
  const nowMs = Date.now();
  resetBackgroundMatchProgressSyncForTest();
  setRunningSnapshot(nowMs, {
    distanceKm: 0.426,
    currentPace: '05:09/km',
  });
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-native',
    mode: 'duel',
    distanceKm: 5,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  const nativeCalls: { body: string; token: string; url: string }[] = [];
  const didFlush = await flushBackgroundMatchProgressSync({
    apiBaseUrl: 'https://preview.example.test/api',
    getAccessToken: async () => 'native-token',
    getNativeMatchProgressUploader: async () => ({
      isNativeMatchProgressUploaderAvailable: () => true,
      uploadMatchProgressNative: (url, token, body) => {
        nativeCalls.push({ body, token, url });
      },
    }),
    isAppBackground: true,
    nowMs,
    platform: 'android',
    updateRunningMatchProgress: async () => {
      throw new Error('JS uploader should not run for native android background sync');
    },
  });

  assert.equal(didFlush, true);
  assert.equal(nativeCalls.length, 1);
  assert.deepEqual(nativeCalls[0], {
    url: 'https://preview.example.test/api/running/matches/progress',
    token: 'native-token',
    body: JSON.stringify({
      matchId: 'duel-match-native',
      distanceKm: 0.43,
      elapsedSeconds: 12,
      currentPace: '05:09/km',
      status: 'running',
    }),
  });
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

test('background match progress sync keeps a recent in-flight upload from duplicating', async () => {
  const nowMs = Date.now();
  resetBackgroundMatchProgressSyncForTest();
  setRunningSnapshot(nowMs);
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-inflight-recent',
    mode: 'duel',
    distanceKm: 5,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  const calls: UpdateRunningMatchProgressInput[] = [];
  const firstFlush = flushBackgroundMatchProgressSync({
    isAppBackground: true,
    nowMs,
    updateRunningMatchProgress: async (input) => {
      calls.push(input);
      return new Promise(() => undefined);
    },
  });
  void firstFlush.catch(() => undefined);

  assert.equal(await flushBackgroundMatchProgressSync({
    isAppBackground: true,
    nowMs: nowMs + BACKGROUND_MATCH_PROGRESS_SYNC_INTERVAL_MS,
    updateRunningMatchProgress: async (input) => {
      calls.push(input);
    },
  }), false);
  assert.equal(calls.length, 1);
});

test('background match progress sync aborts a stale in-flight upload and retries', async () => {
  const nowMs = Date.now();
  resetBackgroundMatchProgressSyncForTest();
  setRunningSnapshot(nowMs);
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-inflight-stale',
    mode: 'duel',
    distanceKm: 5,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  let callCount = 0;
  let didAbortFirstUpload = false;
  const updateRunningMatchProgress = async (
    input: UpdateRunningMatchProgressInput,
    options?: { signal?: AbortSignal },
  ) => {
    callCount += 1;

    if (callCount === 1) {
      return new Promise((_, reject) => {
        options?.signal?.addEventListener('abort', () => {
          didAbortFirstUpload = true;
          reject(new Error('aborted stale upload'));
        }, { once: true });
      });
    }

    assert.equal(input.matchId, 'duel-match-inflight-stale');
    return undefined;
  };

  const firstFlush = flushBackgroundMatchProgressSync({
    isAppBackground: true,
    nowMs,
    updateRunningMatchProgress,
  });
  void firstFlush.catch(() => undefined);

  assert.equal(await flushBackgroundMatchProgressSync({
    isAppBackground: true,
    nowMs: nowMs + BACKGROUND_MATCH_PROGRESS_INFLIGHT_STALE_MS + 1,
    updateRunningMatchProgress,
  }), true);
  assert.equal(didAbortFirstUpload, true);
  assert.equal(callCount, 2);
});

test('background match progress sync stale helper requires the stale threshold to pass', () => {
  const startedAtMs = 1_000;

  assert.equal(isBackgroundMatchProgressInFlightStale(
    startedAtMs,
    startedAtMs + BACKGROUND_MATCH_PROGRESS_INFLIGHT_STALE_MS,
  ), false);
  assert.equal(isBackgroundMatchProgressInFlightStale(
    startedAtMs,
    startedAtMs + BACKGROUND_MATCH_PROGRESS_INFLIGHT_STALE_MS + 1,
  ), true);
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
