import type { AppStateStatus } from 'react-native';
import type { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import type {
  LocationTaskPolicy,
  LocationTaskStartOutcome,
} from '@/features/runs/tracking/background/subscriptions';

export type ManagedLocationTaskOptions = LocationTaskPolicy & {
  detachLocationTask?: boolean;
  trackingKey?: string | null;
};

export type LocationTaskManagerAdapter = {
  startLocationTask: (policy: LocationTaskPolicy) => Promise<LocationTaskStartOutcome>;
  stopLocationTaskIfNeeded: () => Promise<void>;
  mark: typeof rgPerfMark;
  measureStart: typeof rgPerfMeasureStart;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
};

type PendingAppStateSync = {
  resolve: () => void;
  timer: ReturnType<typeof setTimeout>;
};

const APP_STATE_LOCATION_TASK_DEBOUNCE_MS = 500;
const LOCATION_TASK_START_TIMEOUT_MS = 3_000;

// Bounded silent re-arm for a start that failed or came back partially armed. Retries run on JS,
// which is only alive while the screen is on or a foreground service is up — a pending timer
// that cannot fire because JS is suspended simply fires on wake, the earliest a retry could help
// anyway (it never depends on the thing that failed). The backoff keeps native start churn far
// below anything battery- or Android-throttle-relevant.
export const LOCATION_TASK_START_RETRY_BACKOFF_MS = [2_000, 5_000, 15_000, 45_000] as const;
// Hard per-generation (per run segment) budget across ALL retry series, so app-state flapping
// can never mint unlimited fresh series. Reset by stopManagedLocationTask with the generation
// bump.
export const LOCATION_TASK_START_MAX_RETRIES_PER_GENERATION = 8;

type StartRetryContext = {
  // 1-based: which silent retry of the current series this call IS. Absent = user/appState-intent
  // start, which supersedes any pending retry and opens a fresh series on failure.
  retryAttempt: number;
};

function buildManagedLocationTaskKey(options?: ManagedLocationTaskOptions) {
  return [
    options?.trackingKey ?? 'run',
    options?.appState ?? 'active',
  ].join(':');
}

function resolveManagedAppState(options?: ManagedLocationTaskOptions) {
  return options?.appState ?? 'active';
}

function isForegroundActiveTask(options?: ManagedLocationTaskOptions) {
  return resolveManagedAppState(options) === 'active';
}

export function createLocationTaskManager(adapter: LocationTaskManagerAdapter) {
  let activeLocationTaskKey: string | null = null;
  let locationTaskStartRequest: { key: string; promise: Promise<void> } | null = null;
  let pendingAppStateSync: PendingAppStateSync | null = null;
  let locationTaskGeneration = 0;
  let pendingStartRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let startRetriesThisGeneration = 0;
  // TOCTOU zombie arm (적대 검증 2026-08-11): an appState sync minted DURING an awaited stop
  // (reset's native stop in flight) carries the LIVE post-bump generation, so the generation
  // check alone can never refuse it. A sync is a MODIFIER of a generation someone explicitly
  // started, never an initiator — this latch is what lets the debounce below tell the two apart.
  // It is not a competing cancellation flag: stop still cancels via the generation bump, and the
  // latch merely records "this generation has an owner".
  let generationHasStartIntent = false;

  const cancelPendingStartRetry = () => {
    if (pendingStartRetryTimer) {
      adapter.clearTimeout(pendingStartRetryTimer);
      pendingStartRetryTimer = null;
    }
  };

  // Schedule the next silent retry of a failed/partial start series. completedRetryAttempts = 0
  // when the failed attempt was the explicit one. The GENERATION captured at start time is the
  // cancellation authority: stop/reset bump it, and the fired callback re-checks it — the timer
  // clear in stopManagedLocationTask is hygiene, not the guard.
  const scheduleStartRetry = (
    options: ManagedLocationTaskOptions | undefined,
    startGeneration: number,
    completedRetryAttempts: number,
  ) => {
    if (locationTaskGeneration !== startGeneration) {
      return;
    }

    const retryDetail = {
      taskKey: buildManagedLocationTaskKey(options),
      trackingKey: options?.trackingKey ?? null,
    };

    if (completedRetryAttempts >= LOCATION_TASK_START_RETRY_BACKOFF_MS.length) {
      adapter.mark('location task start retries exhausted', {
        ...retryDetail,
        reason: 'series',
      });
      return;
    }

    if (startRetriesThisGeneration >= LOCATION_TASK_START_MAX_RETRIES_PER_GENERATION) {
      adapter.mark('location task start retries exhausted', {
        ...retryDetail,
        reason: 'generation budget',
      });
      return;
    }

    cancelPendingStartRetry();
    startRetriesThisGeneration += 1;
    const retryAttempt = completedRetryAttempts + 1;
    const delayMs = LOCATION_TASK_START_RETRY_BACKOFF_MS[completedRetryAttempts];
    adapter.mark('location task start retry scheduled', {
      ...retryDetail,
      attempt: retryAttempt,
      delayMs,
    });

    pendingStartRetryTimer = adapter.setTimeout(() => {
      pendingStartRetryTimer = null;

      if (locationTaskGeneration !== startGeneration) {
        return;
      }

      // Unreachable by construction today (every start commit cancels the pending retry first),
      // kept as a guard for future call sites: an in-flight start owns the next step — its own
      // terminal handling schedules the follow-up retry if it fails. The policy layer's op queue
      // serializes the native calls regardless, so this only protects slot/trace bookkeeping.
      if (locationTaskStartRequest) {
        adapter.mark('location task start retry yielded to in-flight start', retryDetail);
        return;
      }

      void startLocationTaskWithTrace(options, { retryAttempt }).catch(() => {
        // Silent retries are internal: the attempt's own failure terminal already scheduled the
        // next retry (or gave up), and nobody awaits this promise.
      });
    }, delayMs);
  };

  const startLocationTaskWithTrace = async (
    options?: ManagedLocationTaskOptions,
    retryContext?: StartRetryContext,
  ) => {
    // Every explicit start claims the current generation — including one that dedupes or cancels
    // before the native call (the detached foreground path): its deferred background arm via the
    // appState sync is legitimate and must not be refused.
    generationHasStartIntent = true;
    const taskKey = buildManagedLocationTaskKey(options);
    const appState = resolveManagedAppState(options);
    const isForegroundActive = isForegroundActiveTask(options);

    if (isForegroundActive && options?.detachLocationTask && !options.trackingKey) {
      adapter.mark('background task start canceled before native call', {
        appState,
        taskKey,
        trackingKey: null,
      });
      return;
    }

    if (locationTaskStartRequest?.key === taskKey) {
      adapter.mark('background task start skipped already starting', {
        appState,
        taskKey,
        trackingKey: options?.trackingKey ?? null,
      });
      return locationTaskStartRequest.promise;
    }

    if (activeLocationTaskKey === taskKey) {
      adapter.mark('background task start skipped already started', {
        appState,
        taskKey,
        trackingKey: options?.trackingKey ?? null,
      });
      return;
    }

    if (isForegroundActive) {
      adapter.mark('background task start blocked foreground', {
        appState,
        taskKey,
        trackingKey: options?.trackingKey ?? null,
      });
    }

    // COMMIT POINT — this call will attempt a native start. Any pending silent retry is
    // superseded by this newer intent (its captured options may carry a stale appState/key);
    // if THIS attempt fails, its own terminal handler opens a fresh series. No-op for a firing
    // retry (its timer already cleared itself).
    cancelPendingStartRetry();

    const traceLabel = isForegroundActive ? 'GPS tracking start' : 'background task start';
    const endLocationTaskStartTrace = adapter.measureStart(traceLabel, {
      appState,
      detached: Boolean(options?.detachLocationTask),
      taskKey,
      trackingKey: options?.trackingKey ?? null,
    });
    const startGeneration = locationTaskGeneration;
    let traceEnded = false;
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const finishTrace = (detail: Record<string, string | number | boolean | null>) => {
      if (traceEnded) {
        return;
      }

      traceEnded = true;
      if (timeoutId) {
        adapter.clearTimeout(timeoutId);
        timeoutId = null;
      }
      endLocationTaskStartTrace(detail);
    };

    const markIgnoredLateResult = (reason: string) => {
      adapter.mark('background task start ignored stale appState', {
        appState,
        reason,
        taskKey,
        trackingKey: options?.trackingKey ?? null,
      });
      if (isForegroundActive) {
        adapter.mark('GPS result ignored without screen change', {
          appState,
          reason,
          taskKey,
          trackingKey: options?.trackingKey ?? null,
        });
      }
    };

    const nativeStartPromise = adapter.startLocationTask({
      appState,
      // Silent retries must never surface the Android location-settings dialog; only the
      // user/appState-intent attempt (the series opener) may.
      allowUserSettingsDialog: !retryContext,
    })
      .then((outcome) => {
        if (timedOut) {
          markIgnoredLateResult('timed out');
          // Late-settle heal (adversarial round 1): on the raced paths the background module's
          // own 3s start cap settles a hang-shaped failure only AFTER this race has already
          // expired, so the normal terminal below can never see it. The late result still never
          // records a key and the race/trace semantics are untouched — the ONLY addition is
          // opening the bounded silent series once the op has settled without full armament.
          // A still-hung op settles nothing and schedules nothing; a late SUCCESS needs no
          // retry (the pipeline is armed; the next intent start re-applies + records
          // idempotently).
          if (
            !outcome.fullyArmed
            && locationTaskGeneration === startGeneration
            && locationTaskStartRequest?.key === taskKey
          ) {
            scheduleStartRetry(options, startGeneration, retryContext?.retryAttempt ?? 0);
          }
          return;
        }

        if (
          locationTaskGeneration === startGeneration
          && locationTaskStartRequest?.key === taskKey
        ) {
          if (outcome.fullyArmed) {
            activeLocationTaskKey = taskKey;
            finishTrace({ success: true });
            return;
          }

          // Partially armed (e.g. the native background start rejected below the policy layer,
          // which resolves rather than rejects). Recording this key would make the dedupe above
          // block every same-key re-arm for the rest of the run; clearing forces the next start
          // — explicit or the silent retry scheduled here — to re-apply the whole idempotent
          // policy op.
          activeLocationTaskKey = null;
          finishTrace({
            success: false,
            backgroundTaskStarted: outcome.backgroundTaskStarted,
            foregroundWatchActive: outcome.foregroundWatchActive,
          });
          adapter.mark('location task start incomplete', {
            appState,
            backgroundTaskStarted: outcome.backgroundTaskStarted,
            foregroundWatchActive: outcome.foregroundWatchActive,
            taskKey,
            trackingKey: options?.trackingKey ?? null,
          });
          scheduleStartRetry(options, startGeneration, retryContext?.retryAttempt ?? 0);
          return;
        }

        markIgnoredLateResult('generation changed');
        finishTrace({ success: false, stale: true });
      })
      .catch((taskError) => {
        if (timedOut) {
          markIgnoredLateResult('timed out error');
          // Late-settle heal — same as the resolve branch above: a rejection that lands after
          // the race expired is a settled failure the silent series must cover.
          if (
            locationTaskGeneration === startGeneration
            && locationTaskStartRequest?.key === taskKey
          ) {
            scheduleStartRetry(options, startGeneration, retryContext?.retryAttempt ?? 0);
          }
          return;
        }

        finishTrace({ success: false });
        if (
          locationTaskGeneration === startGeneration
          && locationTaskStartRequest?.key === taskKey
        ) {
          activeLocationTaskKey = null;
          scheduleStartRetry(options, startGeneration, retryContext?.retryAttempt ?? 0);
        }
        throw taskError;
      })
      .finally(() => {
        if (timeoutId) {
          adapter.clearTimeout(timeoutId);
          timeoutId = null;
        }

        if (
          locationTaskGeneration === startGeneration
          && locationTaskStartRequest?.key === taskKey
        ) {
          locationTaskStartRequest = null;
        }
      });

    const shouldUseNonBlockingTimeout = !isForegroundActive || Boolean(options?.detachLocationTask);
    const startPromise = shouldUseNonBlockingTimeout
      ? Promise.race([
        nativeStartPromise,
        new Promise<void>((resolve) => {
          timeoutId = adapter.setTimeout(() => {
            timedOut = true;
            if (isForegroundActive) {
              adapter.mark('GPS tracking start timed out non-blocking', {
                appState,
                taskKey,
                timeoutMs: LOCATION_TASK_START_TIMEOUT_MS,
                trackingKey: options?.trackingKey ?? null,
              });
            } else {
              adapter.mark('background task start timed out detached', {
                appState,
                taskKey,
                timeoutMs: LOCATION_TASK_START_TIMEOUT_MS,
                trackingKey: options?.trackingKey ?? null,
              });
            }
            finishTrace({ success: false, timedOut: true });
            resolve();
          }, LOCATION_TASK_START_TIMEOUT_MS);
        }),
      ])
      : nativeStartPromise;

    locationTaskStartRequest = { key: taskKey, promise: startPromise };
    return startPromise;
  };

  const startManagedLocationTask = async (options?: ManagedLocationTaskOptions) => {
    if (options?.detachLocationTask) {
      adapter.mark('GPS tracking start detached from navigation', {
        appState: options?.appState ?? null,
        trackingKey: options.trackingKey ?? null,
      });
      void startLocationTaskWithTrace(options).catch(() => {
        // Location task startup is best-effort after the UI has already become interactive.
      });
      return;
    }

    await startLocationTaskWithTrace(options);
  };

  const stopManagedLocationTask = async () => {
    if (pendingAppStateSync) {
      adapter.clearTimeout(pendingAppStateSync.timer);
      pendingAppStateSync.resolve();
      pendingAppStateSync = null;
    }

    // Pending silent retries die with the generation — the same cancellation authority the
    // warmup backstops rely on (the timer clear is hygiene; a survived callback re-checks the
    // generation and no-ops).
    cancelPendingStartRetry();
    startRetriesThisGeneration = 0;
    generationHasStartIntent = false;

    activeLocationTaskKey = null;
    locationTaskStartRequest = null;
    locationTaskGeneration += 1;
    await adapter.stopLocationTaskIfNeeded();
  };

  const syncManagedLocationTaskAppState = (
    appState: AppStateStatus,
    options?: Pick<ManagedLocationTaskOptions, 'trackingKey'> & { debounceMs?: number },
  ) => {
    if (pendingAppStateSync) {
      adapter.clearTimeout(pendingAppStateSync.timer);
      pendingAppStateSync.resolve();
      pendingAppStateSync = null;
    }

    const scheduledGeneration = locationTaskGeneration;
    return new Promise<void>((resolve) => {
      const timer = adapter.setTimeout(() => {
        pendingAppStateSync = null;

        // Refuse a sync whose generation has no owner: intent born AFTER a stop's bump (the
        // TOCTOU window while reset awaits the native stop) passes every generation check, and
        // firing it would arm GPS for a dead run that nothing reaps. The generation re-check
        // stays the authority for PRE-bump intent whose timer-clear hygiene was missed.
        if (locationTaskGeneration !== scheduledGeneration || !generationHasStartIntent) {
          adapter.mark('location task app state sync refused without start intent', {
            appState,
            trackingKey: options?.trackingKey ?? null,
          });
          resolve();
          return;
        }

        void startManagedLocationTask({
          appState,
          trackingKey: options?.trackingKey,
        }).finally(resolve);
      }, options?.debounceMs ?? APP_STATE_LOCATION_TASK_DEBOUNCE_MS);

      pendingAppStateSync = { resolve, timer };
    });
  };

  return {
    startManagedLocationTask,
    stopManagedLocationTask,
    syncManagedLocationTaskAppState,
  };
}
