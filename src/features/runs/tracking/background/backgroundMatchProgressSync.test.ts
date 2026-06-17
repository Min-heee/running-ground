import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  UpdateRunningMatchProgressInput,
  UpdateRunningMatchProgressResponse,
} from '@/lib/api/types';
import {
  BACKGROUND_MATCH_PROGRESS_INFLIGHT_STALE_MS,
  BACKGROUND_MATCH_PROGRESS_SYNC_INTERVAL_MS,
  clearBackgroundMatchProgressContext,
  clearBackgroundMatchStatusApplier,
  flushBackgroundMatchProgressSync,
  getBackgroundMatchProgressContext,
  isBackgroundMatchProgressInFlightStale,
  resetBackgroundMatchProgressSyncForTest,
  setBackgroundMatchProgressContext,
  setBackgroundMatchStatusApplier,
} from '@/features/runs/tracking/background/backgroundMatchProgressSync';
import {
  INITIAL_SNAPSHOT,
  setSnapshotState,
} from '@/features/runs/tracking/background/snapshotStore';

function buildMatchStatusResponse(
  matchId: string,
  overrides?: Partial<UpdateRunningMatchProgressResponse>,
): UpdateRunningMatchProgressResponse {
  return {
    success: true,
    mode: 'duel',
    state: 'active',
    matchId,
    distanceKm: 5,
    slotStartAt: '2026-05-29T00:00:00.000Z',
    slotLabel: '',
    paceBandLabel: '',
    levelBandLabel: '',
    criteriaSummary: '',
    estimatedWaitMinutes: 0,
    participantCount: 2,
    acceptedCount: 2,
    capacity: 2,
    userAccepted: true,
    readyToStart: true,
    ...overrides,
  };
}

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
      return buildMatchStatusResponse(input.matchId);
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
      return buildMatchStatusResponse(input.matchId);
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
      return buildMatchStatusResponse(input.matchId);
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
      uploadMatchProgressNative: async (url, token, body) => {
        nativeCalls.push({ body, token, url });
        return null;
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
    return buildMatchStatusResponse(input.matchId);
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
      return new Promise<UpdateRunningMatchProgressResponse>(() => undefined);
    },
  });
  void firstFlush.catch(() => undefined);

  assert.equal(await flushBackgroundMatchProgressSync({
    isAppBackground: true,
    nowMs: nowMs + BACKGROUND_MATCH_PROGRESS_SYNC_INTERVAL_MS,
    updateRunningMatchProgress: async (input) => {
      calls.push(input);
      return buildMatchStatusResponse(input.matchId);
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
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<UpdateRunningMatchProgressResponse> => {
    callCount += 1;

    if (callCount === 1) {
      return new Promise<UpdateRunningMatchProgressResponse>((_, reject) => {
        options?.signal?.addEventListener('abort', () => {
          didAbortFirstUpload = true;
          reject(new Error('aborted stale upload'));
        }, { once: true });
      });
    }

    assert.equal(input.matchId, 'duel-match-inflight-stale');
    return buildMatchStatusResponse(input.matchId);
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

test('background match progress sync applies the JS-fallback response status', async () => {
  const nowMs = Date.now();
  resetBackgroundMatchProgressSyncForTest();
  setRunningSnapshot(nowMs);
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-apply-js',
    mode: 'duel',
    distanceKm: 5,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  const applied: UpdateRunningMatchProgressResponse[] = [];
  setBackgroundMatchStatusApplier((status) => {
    applied.push(status);
  });

  try {
    const didFlush = await flushBackgroundMatchProgressSync({
      isAppBackground: true,
      nowMs,
      updateRunningMatchProgress: async (input) => buildMatchStatusResponse(input.matchId, {
        distanceKm: 1.23,
      }),
    });

    assert.equal(didFlush, true);
    assert.equal(applied.length, 1);
    assert.equal(applied[0].matchId, 'duel-match-apply-js');
    assert.equal(applied[0].distanceKm, 1.23);
  } finally {
    setBackgroundMatchStatusApplier(null);
  }
});

test('background match progress sync parses and applies the native android response body', async () => {
  const nowMs = Date.now();
  resetBackgroundMatchProgressSyncForTest();
  setRunningSnapshot(nowMs);
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-apply-native',
    mode: 'duel',
    distanceKm: 5,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  const applied: UpdateRunningMatchProgressResponse[] = [];
  setBackgroundMatchStatusApplier((status) => {
    applied.push(status);
  });

  try {
    const responseBody = JSON.stringify(buildMatchStatusResponse('duel-match-apply-native', {
      distanceKm: 2.5,
    }));
    const didFlush = await flushBackgroundMatchProgressSync({
      apiBaseUrl: 'https://preview.example.test/api',
      getAccessToken: async () => 'native-token',
      getNativeMatchProgressUploader: async () => ({
        isNativeMatchProgressUploaderAvailable: () => true,
        uploadMatchProgressNative: async () => responseBody,
      }),
      isAppBackground: true,
      nowMs,
      platform: 'android',
      updateRunningMatchProgress: async () => {
        throw new Error('JS uploader should not run for native android background sync');
      },
    });

    assert.equal(didFlush, true);
    assert.equal(applied.length, 1);
    assert.equal(applied[0].matchId, 'duel-match-apply-native');
    assert.equal(applied[0].distanceKm, 2.5);
  } finally {
    setBackgroundMatchStatusApplier(null);
  }
});

test('background match progress sync drops a JS-fallback response whose context was cleared mid-flight', async () => {
  const nowMs = Date.now();
  resetBackgroundMatchProgressSyncForTest();
  setRunningSnapshot(nowMs);
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-cleared-mid-flight',
    mode: 'duel',
    distanceKm: 5,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  const applied: UpdateRunningMatchProgressResponse[] = [];
  setBackgroundMatchStatusApplier((statusResponse) => {
    applied.push(statusResponse);
  });

  try {
    const didFlush = await flushBackgroundMatchProgressSync({
      isAppBackground: true,
      nowMs,
      updateRunningMatchProgress: async (input) => {
        // Simulate forfeit / finish teardown clearing the context WHILE this request is in flight.
        clearBackgroundMatchProgressContext('duel-match-cleared-mid-flight');
        return buildMatchStatusResponse(input.matchId, { state: 'active' });
      },
    });

    assert.equal(didFlush, true);
    // The response resolved AFTER the context was cleared, so the defense-in-depth re-check drops
    // it and the applier is never invoked — a torn-down match can't be re-applied (B1).
    assert.equal(applied.length, 0);
  } finally {
    setBackgroundMatchStatusApplier(null);
  }
});

test('background match progress sync tolerates a malformed native response body', async () => {
  const nowMs = Date.now();
  resetBackgroundMatchProgressSyncForTest();
  setRunningSnapshot(nowMs);
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-apply-native-bad',
    mode: 'duel',
    distanceKm: 5,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  const applied: UpdateRunningMatchProgressResponse[] = [];
  setBackgroundMatchStatusApplier((status) => {
    applied.push(status);
  });

  try {
    const didFlush = await flushBackgroundMatchProgressSync({
      apiBaseUrl: 'https://preview.example.test/api',
      getAccessToken: async () => 'native-token',
      getNativeMatchProgressUploader: async () => ({
        isNativeMatchProgressUploaderAvailable: () => true,
        uploadMatchProgressNative: async () => '<html>not json</html>',
      }),
      isAppBackground: true,
      nowMs,
      platform: 'android',
      updateRunningMatchProgress: async () => {
        throw new Error('JS uploader should not run for native android background sync');
      },
    });

    // A non-JSON body must not throw out of the flush, and must not apply anything.
    assert.equal(didFlush, true);
    assert.equal(applied.length, 0);
  } finally {
    setBackgroundMatchStatusApplier(null);
  }
});

// M2 — identity-scoped applier teardown. An unmounting (older) instance clearing its applier must
// NOT wipe a surviving (newer) instance's applier, so the background fix stays live across the
// documented duplicate runtime-mount (#135) / StrictMode case.
test('background match progress applier teardown is identity-scoped', async () => {
  const nowMs = Date.now();
  resetBackgroundMatchProgressSyncForTest();
  setRunningSnapshot(nowMs);
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-applier-identity',
    mode: 'duel',
    distanceKm: 5,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  const appliedBySurvivor: UpdateRunningMatchProgressResponse[] = [];
  const stale = () => undefined;
  const survivor = (statusResponse: UpdateRunningMatchProgressResponse) => {
    appliedBySurvivor.push(statusResponse);
  };

  // The surviving instance registers last and owns the applier slot.
  setBackgroundMatchStatusApplier(stale);
  setBackgroundMatchStatusApplier(survivor);

  // The older instance unmounts and clears BY IDENTITY: it is no longer the owner, so this is a
  // no-op and must NOT disable the survivor's applier.
  clearBackgroundMatchStatusApplier(stale);

  try {
    const didFlush = await flushBackgroundMatchProgressSync({
      isAppBackground: true,
      nowMs,
      updateRunningMatchProgress: async (input) => buildMatchStatusResponse(input.matchId),
    });

    assert.equal(didFlush, true);
    // The survivor's applier is still wired, so the response is applied.
    assert.equal(appliedBySurvivor.length, 1);
  } finally {
    setBackgroundMatchStatusApplier(null);
  }
});
