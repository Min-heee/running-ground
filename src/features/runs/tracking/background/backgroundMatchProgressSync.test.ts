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
  NATIVE_SUBGOAL_CAP_EPSILON_KM,
  resetBackgroundMatchProgressSyncForTest,
  setBackgroundMatchProgressContext,
  setBackgroundMatchStatusApplier,
} from '@/features/runs/tracking/background/backgroundMatchProgressSync';
import {
  INITIAL_SNAPSHOT,
  setSnapshotState,
} from '@/features/runs/tracking/background/snapshotStore';
import {
  resetNativeDistanceAccumulatorForTest,
  setNativeDistanceAccumulatorModuleForTest,
  startNativeDistanceAccumulator,
} from '@/features/runs/tracking/background/distanceAccumulatorController';
import { MATCH_GOAL_DISTANCE_TOLERANCE_KM } from '@/features/runs/sync/matchProgressSync';
import { recordBackgroundSnapshotUpdate } from '@/features/runs/tracking/background/backgroundSyncDiagnostics';
import { MY_MATCH_DISTANCE_STALE_THRESHOLD_MS } from '@/features/runs/sync/matchDistanceStaleness';
import { setAccumulatedDistanceMeters } from '@/features/runs/tracking/background/routeAccumulator';

// Wire a fake native DISTANCE accumulator that reports a fixed accumulated total (in meters) so the
// flush merge reads a controllable native value. Returns a teardown to clear the seam + cache.
// `availableMeters` is the native accumulator's screen-off total — set it ABOVE the JS snapshot to
// simulate native over-count (the competitive-integrity case under test).
async function withNativeDistance(availableMeters: number | null): Promise<() => void> {
  resetNativeDistanceAccumulatorForTest();

  if (availableMeters == null) {
    // No native module resolves (Expo Go / old binary / iOS no-op) → merge degrades to JS-only.
    setNativeDistanceAccumulatorModuleForTest(null);
    return () => {
      setNativeDistanceAccumulatorModuleForTest(undefined);
      resetNativeDistanceAccumulatorForTest();
    };
  }

  const fakeModule = {
    isNativeDistanceAccumulatorAvailable: () => true,
    startDistanceAccumulator: () => true,
    seedDistanceAccumulator: () => undefined,
    getAccumulatedDistanceMeters: () => availableMeters,
    resetDistanceAccumulator: () => undefined,
    stopDistanceAccumulator: () => undefined,
  };
  setNativeDistanceAccumulatorModuleForTest(fakeModule);
  // Populate the synchronous cachedModule the flush reads via getMergeableNativeDistanceMeters().
  await startNativeDistanceAccumulator('seed-match', 0, async () => fakeModule);

  return () => {
    setNativeDistanceAccumulatorModuleForTest(undefined);
    resetNativeDistanceAccumulatorForTest();
  };
}

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

// Fix A.2(b) — self-healing single-flight lock. A background push that REJECTS (its abort/timeout
// fired, e.g. JS thread frozen then resumed) must leave the in-flight slot CLEAR so the very next
// flush proceeds instead of being wedged behind a dead in-flight reference until foreground.
test('background match progress sync self-heals after an aborted/timed-out push so the next flush proceeds', async () => {
  const nowMs = Date.now();
  resetBackgroundMatchProgressSyncForTest();
  setRunningSnapshot(nowMs);
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-selfheal',
    mode: 'duel',
    distanceKm: 5,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  const calls: UpdateRunningMatchProgressInput[] = [];

  // First push rejects immediately (simulating the per-request timeout/abort firing).
  const firstFlush = flushBackgroundMatchProgressSync({
    isAppBackground: true,
    nowMs,
    updateRunningMatchProgress: async (input) => {
      calls.push(input);
      throw new Error('timed out');
    },
  });
  // The flush awaits the push, so a rejected push rejects the flush — swallow it like the caller
  // (locationTask fire-and-forget) does.
  await firstFlush.catch(() => undefined);

  // The next flush is one interval later. Because the rejected push (a) did NOT advance the
  // throttle and (b) cleared the in-flight slot in finally, this flush proceeds and POSTs again.
  const secondCalls: UpdateRunningMatchProgressInput[] = [];
  const didFlush = await flushBackgroundMatchProgressSync({
    isAppBackground: true,
    nowMs: nowMs + BACKGROUND_MATCH_PROGRESS_SYNC_INTERVAL_MS,
    updateRunningMatchProgress: async (input) => {
      secondCalls.push(input);
      return buildMatchStatusResponse(input.matchId);
    },
  });

  assert.equal(didFlush, true);
  assert.equal(calls.length, 1);
  assert.equal(secondCalls.length, 1);
  assert.equal(secondCalls[0].matchId, 'duel-match-selfheal');
});

// Fix A.2(a) — the throttle timestamp is advanced ONLY after a successful round-trip. A failed
// push must NOT pre-commit the throttle, so the next tick can retry immediately rather than wait
// out a full interval behind a push that never landed.
test('background match progress sync does not advance the throttle on a failed push', async () => {
  const nowMs = Date.now();
  resetBackgroundMatchProgressSyncForTest();
  setRunningSnapshot(nowMs);
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-no-throttle-on-fail',
    mode: 'duel',
    distanceKm: 5,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  let callCount = 0;
  const updateRunningMatchProgress = async (input: UpdateRunningMatchProgressInput) => {
    callCount += 1;
    if (callCount === 1) {
      throw new Error('network down');
    }
    return buildMatchStatusResponse(input.matchId);
  };

  await flushBackgroundMatchProgressSync({
    isAppBackground: true,
    nowMs,
    updateRunningMatchProgress,
  }).catch(() => undefined);

  // Only 1ms later — well within the throttle interval. Because the first push FAILED, the
  // throttle was never advanced, so this retry is allowed (it is not throttle-blocked).
  const didFlush = await flushBackgroundMatchProgressSync({
    isAppBackground: true,
    nowMs: nowMs + 1,
    updateRunningMatchProgress,
  });

  assert.equal(didFlush, true);
  assert.equal(callCount, 2);
});

// Fix A.5 / OTA-SAFETY — the iOS native branch is taken ONLY when the runtime availability check
// is true. On the current iOS no-op binary (availability false) iOS must keep the JS fetch
// fallback so the OTA does not break today's behavior.
test('background match progress sync routes ios to native only when the native uploader is available', async () => {
  const nowMs = Date.now();

  // Available iOS build → native path is used, JS fallback is NOT.
  resetBackgroundMatchProgressSyncForTest();
  setRunningSnapshot(nowMs);
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-ios-native',
    mode: 'duel',
    distanceKm: 5,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  const iosNativeCalls: { body: string; token: string; url: string }[] = [];
  const didFlushNative = await flushBackgroundMatchProgressSync({
    apiBaseUrl: 'https://preview.example.test/api',
    getAccessToken: async () => 'ios-token',
    getNativeMatchProgressUploader: async () => ({
      isNativeMatchProgressUploaderAvailable: () => true,
      uploadMatchProgressNative: async (url, token, body) => {
        iosNativeCalls.push({ body, token, url });
        return null;
      },
    }),
    isAppBackground: true,
    nowMs,
    platform: 'ios',
    updateRunningMatchProgress: async () => {
      throw new Error('JS fallback should not run when the iOS native uploader is available');
    },
  });

  assert.equal(didFlushNative, true);
  assert.equal(iosNativeCalls.length, 1);
  assert.equal(iosNativeCalls[0].url, 'https://preview.example.test/api/running/matches/progress');

  // Current iOS no-op binary (availability false) → native branch is skipped, JS fallback runs.
  resetBackgroundMatchProgressSyncForTest();
  setRunningSnapshot(nowMs);
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-ios-noop',
    mode: 'duel',
    distanceKm: 5,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  let nativeCalled = false;
  const jsCalls: UpdateRunningMatchProgressInput[] = [];
  const didFlushFallback = await flushBackgroundMatchProgressSync({
    getNativeMatchProgressUploader: async () => ({
      isNativeMatchProgressUploaderAvailable: () => false,
      uploadMatchProgressNative: async () => {
        nativeCalled = true;
        return null;
      },
    }),
    isAppBackground: true,
    nowMs,
    platform: 'ios',
    updateRunningMatchProgress: async (input) => {
      jsCalls.push(input);
      return buildMatchStatusResponse(input.matchId);
    },
  });

  assert.equal(didFlushFallback, true);
  assert.equal(nativeCalled, false);
  assert.equal(jsCalls.length, 1);
  assert.equal(jsCalls[0].matchId, 'duel-match-ios-noop');
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

// ============================================================================================
// COMPETITIVE-INTEGRITY GUARD — native distance is a GAP-ONLY floor that NEVER crosses the goal.
// The native accumulator omits some JS jitter filters and can OVER-COUNT under real GPS jitter.
// The flush (a) derives the finish status from the JS snapshot ONLY, and (b) caps the SENT distance
// strictly below the goal threshold until the JS pipeline itself reaches the goal, so a native
// over-count can never trigger a premature/unfair finish (client status OR the server's own
// reachedGoalDistance check). These tests prove that contract end-to-end through the flush.
// ============================================================================================

const COMPETITIVE_GOAL_KM = 5;
const COMPETITIVE_GOAL_THRESHOLD_KM = COMPETITIVE_GOAL_KM - MATCH_GOAL_DISTANCE_TOLERANCE_KM;

// (a) Native OVER-COUNTS to/over the goal while the JS snapshot is clearly below it. The sent status
// must stay 'running' AND the sent distance must be capped STRICTLY below the goal threshold — no
// premature finish from native over-count (neither the client status nor the server reachedGoal).
test('competitive-integrity: native over-count below the goal keeps status running AND caps the sent distance below the goal threshold', async () => {
  // SCREEN OFF (STALE) is the only path where the native floor fills the frozen gap. Stamp a fresh
  // snapshot, record the JS authoritative total as the last-fresh baseline (4.6km), then advance nowMs
  // past the staleness threshold so the flush takes the stale (native-fill) branch.
  resetBackgroundMatchProgressSyncForTest();
  setAccumulatedDistanceMeters(4600);
  recordBackgroundSnapshotUpdate();
  const staleNowMs = Date.now() + MY_MATCH_DISTANCE_STALE_THRESHOLD_MS + 5_000;
  setRunningSnapshot(staleNowMs, { distanceKm: 4.6 }); // JS frozen under the goal (filtered, accurate)
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-native-overcount',
    mode: 'duel',
    distanceKm: COMPETITIVE_GOAL_KM,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  // Native over-counted PAST the goal (5200m = 5.2km > 5km goal) while the screen was off.
  const teardown = await withNativeDistance(5200);

  const calls: UpdateRunningMatchProgressInput[] = [];
  try {
    const didFlush = await flushBackgroundMatchProgressSync({
      isAppBackground: true,
      nowMs: staleNowMs,
      updateRunningMatchProgress: async (input) => {
        calls.push(input);
        return buildMatchStatusResponse(input.matchId);
      },
    });

    assert.equal(didFlush, true);
    assert.equal(calls.length, 1);
    // Status stays running — native over-count cannot flip the finish (status is JS-snapshot only).
    assert.equal(calls[0].status, 'running');
    // Sent distance is the native floor (live-gap advance) but CAPPED strictly below the goal
    // threshold so the server's reachedGoalDistance can't trip from native.
    assert.ok(
      calls[0].distanceKm < COMPETITIVE_GOAL_THRESHOLD_KM,
      `sent distance ${calls[0].distanceKm} must be strictly below the goal threshold ${COMPETITIVE_GOAL_THRESHOLD_KM}`,
    );
    assert.equal(
      calls[0].distanceKm,
      COMPETITIVE_GOAL_THRESHOLD_KM - NATIVE_SUBGOAL_CAP_EPSILON_KM,
      'capped to (goalThreshold - epsilon) — the native floor advances right up to just below the goal',
    );
    // The sent distance still ADVANCED the opponent gap above the frozen JS snapshot (4.6km) — the
    // whole point of the native floor — without crossing the goal.
    assert.ok(calls[0].distanceKm > 4.6, 'native floor advanced the live gap above the JS snapshot');
  } finally {
    teardown();
  }
});

// FRESH-JS-WINS (screen on): when JS is fresh, native over-count can NOT inflate the sent distance at
// all — even stronger competitive integrity than the cap. The sent distance is the JS total exactly.
test('competitive-integrity: when JS is fresh, native over-count cannot inflate the sent distance (JS total sent)', async () => {
  const nowMs = Date.now();
  resetBackgroundMatchProgressSyncForTest();
  setAccumulatedDistanceMeters(4600);
  recordBackgroundSnapshotUpdate(); // FRESH
  setRunningSnapshot(nowMs, { distanceKm: 4.6 });
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-native-overcount-fresh',
    mode: 'duel',
    distanceKm: COMPETITIVE_GOAL_KM,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  const teardown = await withNativeDistance(5200); // native far ahead — must be ignored while fresh

  const calls: UpdateRunningMatchProgressInput[] = [];
  try {
    const didFlush = await flushBackgroundMatchProgressSync({
      isAppBackground: true,
      nowMs,
      updateRunningMatchProgress: async (input) => {
        calls.push(input);
        return buildMatchStatusResponse(input.matchId);
      },
    });

    assert.equal(didFlush, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].status, 'running');
    assert.equal(calls[0].distanceKm, 4.6, 'fresh JS is authoritative — native over-count is ignored');
  } finally {
    teardown();
  }
});

// (b) The JS pipeline itself reaches the goal → status 'finished'. JS is FRESH here, so the sent
// distance is the JS total exactly (native cannot inflate a fresh flush) — a legit finish.
test('competitive-integrity: when the JS snapshot reaches the goal, status is finished and the JS distance is sent', async () => {
  const nowMs = Date.now();
  resetBackgroundMatchProgressSyncForTest();
  // JS itself reached the goal threshold (accurate, all filters) — a legit finish. FRESH.
  setAccumulatedDistanceMeters(COMPETITIVE_GOAL_KM * 1000);
  recordBackgroundSnapshotUpdate();
  setRunningSnapshot(nowMs, { distanceKm: COMPETITIVE_GOAL_KM });
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-js-finished',
    mode: 'duel',
    distanceKm: COMPETITIVE_GOAL_KM,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  // Native is slightly ahead (5050m) — but JS is fresh, so the JS total is sent (native ignored).
  const teardown = await withNativeDistance(5050);

  const calls: UpdateRunningMatchProgressInput[] = [];
  try {
    const didFlush = await flushBackgroundMatchProgressSync({
      isAppBackground: true,
      nowMs,
      updateRunningMatchProgress: async (input) => {
        calls.push(input);
        return buildMatchStatusResponse(input.matchId);
      },
    });

    assert.equal(didFlush, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].status, 'finished', 'JS reached the goal → legit finish');
    // Fresh JS wins: the JS total (5.0) is sent, not the native 5.05.
    assert.equal(calls[0].distanceKm, 5.0, 'fresh JS distance sent once JS has reached the goal');
  } finally {
    teardown();
  }
});

// (c) Native BELOW the JS snapshot (the normal case — JS pipeline ahead) → unchanged behavior: the
// JS distance is sent and the JS-derived status applies. Native never drags the value down.
test('competitive-integrity: native below the JS snapshot is unchanged behavior (JS distance sent)', async () => {
  const nowMs = Date.now();
  resetBackgroundMatchProgressSyncForTest();
  setRunningSnapshot(nowMs, { distanceKm: 3.2 });
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-native-below',
    mode: 'duel',
    distanceKm: COMPETITIVE_GOAL_KM,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  // Native trails the JS snapshot (3000m = 3.0km < 3.2km).
  const teardown = await withNativeDistance(3000);

  const calls: UpdateRunningMatchProgressInput[] = [];
  try {
    const didFlush = await flushBackgroundMatchProgressSync({
      isAppBackground: true,
      nowMs,
      updateRunningMatchProgress: async (input) => {
        calls.push(input);
        return buildMatchStatusResponse(input.matchId);
      },
    });

    assert.equal(didFlush, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].status, 'running');
    // max(js, native) === js — the JS distance is sent, native never drags it down.
    assert.equal(calls[0].distanceKm, 3.2, 'JS distance sent (native trailing) — unchanged behavior');
  } finally {
    teardown();
  }
});

// (d) Flag-off / native-unavailable → EXACTLY today's behavior: the JS snapshot distance is sent and
// the JS-derived status applies, with no native influence at all.
test('competitive-integrity: native unavailable sends exactly the JS snapshot distance and JS status (today behavior)', async () => {
  const nowMs = Date.now();
  resetBackgroundMatchProgressSyncForTest();
  setRunningSnapshot(nowMs, { distanceKm: 2.75 });
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-native-unavailable',
    mode: 'duel',
    distanceKm: COMPETITIVE_GOAL_KM,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  // No native module resolves → getMergeableNativeDistanceMeters() returns 0 → merge is jsKm.
  const teardown = await withNativeDistance(null);

  const calls: UpdateRunningMatchProgressInput[] = [];
  try {
    const didFlush = await flushBackgroundMatchProgressSync({
      isAppBackground: true,
      nowMs,
      updateRunningMatchProgress: async (input) => {
        calls.push(input);
        return buildMatchStatusResponse(input.matchId);
      },
    });

    assert.equal(didFlush, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].status, 'running');
    assert.equal(calls[0].distanceKm, 2.75, 'exactly the JS snapshot distance — no native influence');
  } finally {
    teardown();
  }
});

// ============================================================================================
// COLD-START OVER-COUNT FIX — re-seed the native total to the JS authoritative total while MY JS
// distance is FRESH. The native accumulator inherits the JS filters at t0 (it is SEEDED to the JS
// total) but accumulates on its own GPS deltas, which omit the JS cold-start cluster collapse — so
// at GPS cold start it OVER-COUNTS warmup jitter, and max(jsKm, nativeKm) would preserve that as a
// CONSTANT offset forever. Re-seeding to the current JS total every fresh flush erases the
// over-count; only when JS goes STALE (screen off) does the native stop being re-seeded and LEAD to
// fill the frozen distance. These tests prove both halves end-to-end through the flush.
// ============================================================================================

// A native accumulator fake whose accumulated total is MUTATED by seedDistanceAccumulator — so the
// flush's re-seed is observable as a change in the value the merge reads next. `startMeters` is the
// native's current (cold-start over-counted) total. Records every seed for assertion.
async function withSeedableNativeDistance(startMeters: number): Promise<{
  teardown: () => void;
  seedCalls: number[];
  getNativeMeters: () => number;
}> {
  resetNativeDistanceAccumulatorForTest();

  let nativeMeters = startMeters;
  const seedCalls: number[] = [];
  const fakeModule = {
    isNativeDistanceAccumulatorAvailable: () => true,
    startDistanceAccumulator: () => true,
    seedDistanceAccumulator: (meters: number) => {
      seedCalls.push(meters);
      // Re-seeding realigns the native TOTAL to the supplied value (mirrors the native: the GPS
      // anchor is kept, but the running total is overwritten to the seed).
      nativeMeters = meters;
    },
    getAccumulatedDistanceMeters: () => nativeMeters,
    resetDistanceAccumulator: () => undefined,
    stopDistanceAccumulator: () => undefined,
  };
  setNativeDistanceAccumulatorModuleForTest(fakeModule);
  // Populate the synchronous cachedModule the flush reads. The 'seed-match' start seeds to 0; reset
  // the fake's total back to the cold-start over-count we want to test AFTER that wiring seed.
  await startNativeDistanceAccumulator('seed-match', 0, async () => fakeModule);
  nativeMeters = startMeters;
  seedCalls.length = 0;

  return {
    seedCalls,
    getNativeMeters: () => nativeMeters,
    teardown: () => {
      setNativeDistanceAccumulatorModuleForTest(undefined);
      resetNativeDistanceAccumulatorForTest();
    },
  };
}

// (a) JS FRESH → the native cold-start over-count is re-seeded DOWN to the JS total, so the merge
// equals the JS distance (the constant offset is erased) and seedDistanceAccumulator is called with
// the JS total in meters.
test('cold-start re-seed: JS fresh re-seeds the native over-count down to the JS total (merge == JS, no offset)', async () => {
  const nowMs = Date.now();
  resetBackgroundMatchProgressSyncForTest();
  // JS snapshot + authoritative accumulator agree at 3.000 km (the JS-filtered truth).
  setRunningSnapshot(nowMs, { distanceKm: 3.0 });
  setAccumulatedDistanceMeters(3000);
  // Stamp the JS distance as FRESH right now (a committed snapshot) so isMyMatchDistanceStale=false.
  recordBackgroundSnapshotUpdate();
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-coldstart-fresh',
    mode: 'duel',
    distanceKm: COMPETITIVE_GOAL_KM,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  // Native carries a cold-start over-count: 3055m (a ~55m phantom lead over the 3000m JS truth).
  const { teardown, seedCalls } = await withSeedableNativeDistance(3055);

  const calls: UpdateRunningMatchProgressInput[] = [];
  try {
    const didFlush = await flushBackgroundMatchProgressSync({
      isAppBackground: true,
      nowMs,
      updateRunningMatchProgress: async (input) => {
        calls.push(input);
        return buildMatchStatusResponse(input.matchId);
      },
    });

    assert.equal(didFlush, true);
    // The re-seed fired with the JS authoritative total in METERS (3000m), realigning the native
    // total down from its 3055m cold-start over-count.
    assert.deepEqual(seedCalls, [3000], 'native re-seeded to the JS total while fresh');
    assert.equal(calls.length, 1);
    // The merge now reads the corrected native total (3000m) → max(3.0, 3.0) === 3.0 === JS. The
    // ~55m constant offset is erased.
    assert.equal(calls[0].distanceKm, 3.0, 'merge equals the JS total — cold-start over-count erased');
  } finally {
    teardown();
  }
});

// (b) JS STALE (screen off) → the native is NOT re-seeded; it keeps its lead and FILLS the frozen
// distance. The merge takes the native value (max), preserving the screen-off advance.
test('cold-start re-seed: JS stale does NOT re-seed and the native leads to fill the frozen distance', async () => {
  // Stamp the JS distance as fresh, then advance nowMs PAST the staleness threshold so the same
  // committed-snapshot timestamp now reads as STALE (JS thread suspended, screen off).
  resetBackgroundMatchProgressSyncForTest();
  recordBackgroundSnapshotUpdate();
  const staleNowMs = Date.now() + MY_MATCH_DISTANCE_STALE_THRESHOLD_MS + 5_000;

  // JS distance is FROZEN at 3.000 km (screen-off suspend); the native kept advancing to 3.250 km.
  setRunningSnapshot(staleNowMs, { distanceKm: 3.0 });
  setAccumulatedDistanceMeters(3000);
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-coldstart-stale',
    mode: 'duel',
    distanceKm: COMPETITIVE_GOAL_KM,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  const { teardown, seedCalls } = await withSeedableNativeDistance(3250);

  const calls: UpdateRunningMatchProgressInput[] = [];
  try {
    const didFlush = await flushBackgroundMatchProgressSync({
      isAppBackground: true,
      nowMs: staleNowMs,
      updateRunningMatchProgress: async (input) => {
        calls.push(input);
        return buildMatchStatusResponse(input.matchId);
      },
    });

    assert.equal(didFlush, true);
    // No re-seed while stale — the native keeps accumulating from the last fresh seed and LEADS.
    assert.deepEqual(seedCalls, [], 'no re-seed while JS is stale (native must lead)');
    assert.equal(calls.length, 1);
    // The merge takes the native lead (3.25 km) → the frozen JS distance is filled screen-off.
    assert.equal(calls[0].distanceKm, 3.25, 'native leads to fill the frozen distance (merge == native)');
  } finally {
    teardown();
  }
});

// (c) Native unavailable / flag-off → no seed call, behavior unchanged (exactly the JS distance).
test('cold-start re-seed: native unavailable performs no re-seed and is unchanged behavior', async () => {
  const nowMs = Date.now();
  resetBackgroundMatchProgressSyncForTest();
  setRunningSnapshot(nowMs, { distanceKm: 2.75 });
  setAccumulatedDistanceMeters(2750);
  recordBackgroundSnapshotUpdate(); // JS fresh — the re-seed WOULD fire if native were available.
  setBackgroundMatchProgressContext({
    matchId: 'duel-match-coldstart-unavailable',
    mode: 'duel',
    distanceKm: COMPETITIVE_GOAL_KM,
    slotStartAt: '2026-05-29T00:00:00.000Z',
  });

  // No native module resolves → the re-seed wrapper no-ops AND the merge degrades to JS-only.
  const teardown = await withNativeDistance(null);

  const calls: UpdateRunningMatchProgressInput[] = [];
  try {
    const didFlush = await flushBackgroundMatchProgressSync({
      isAppBackground: true,
      nowMs,
      updateRunningMatchProgress: async (input) => {
        calls.push(input);
        return buildMatchStatusResponse(input.matchId);
      },
    });

    assert.equal(didFlush, true);
    assert.equal(calls.length, 1);
    // No native influence at all — exactly the JS snapshot distance (the re-seed could not throw or
    // mutate anything because the native accumulator is unavailable).
    assert.equal(calls[0].distanceKm, 2.75, 'exactly the JS snapshot distance — re-seed no-op');
  } finally {
    teardown();
  }
});
