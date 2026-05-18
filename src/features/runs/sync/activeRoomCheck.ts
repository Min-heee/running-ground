import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import {
  buildTimedOutActiveRoomCheckResult,
  getActiveRoomCheckResultSkipReason,
  mapCompletedActiveRoomCheckForCaller,
} from '@/features/runs/sync/activeRoomCheckResultPolicy';
import {
  buildActiveRoomCheckRegistryKey,
  cleanupInFlightActiveRoomCheck,
  createActiveRoomCheckGeneration,
  createActiveRoomCheckRequestId,
  getInFlightActiveRoomCheck,
  getLastActiveRoomCheck,
  resetActiveRoomCheckRegistryForTest,
  setLastActiveRoomCheck,
  shouldLogSuppressedActiveRoomCheckEvent,
  startInFlightActiveRoomCheck,
} from '@/features/runs/sync/activeRoomCheckRequestRegistry';
import type {
  ActiveRoomCheckOptions,
  ActiveRoomCheckResult,
  ActiveRoomCheckResultSkipReason,
  CompletedActiveRoomCheck,
  InFlightActiveRoomCheck,
} from '@/features/runs/sync/activeRoomCheckTypes';
import {
  ACTIVE_ROOM_CHECK_STALE_RESULT_MS,
  ACTIVE_ROOM_CHECK_UI_TIMEOUT_MS,
  DEFAULT_THROTTLE_MS_BY_SOURCE,
} from '@/features/runs/sync/activeRoomCheckTypes';

export { getActiveRoomCheckResultSkipReason };
export type { ActiveRoomCheckResultSkipReason };

function getNowMs() {
  return Date.now();
}

function raceActiveRoomCheckWithTimeout({
  check,
  hardTimeoutMs,
  routeKey,
  reused,
  skipped,
  uiTimeoutMs,
}: {
  check: InFlightActiveRoomCheck;
  hardTimeoutMs: number;
  routeKey?: string | null;
  reused: boolean;
  skipped: boolean;
  uiTimeoutMs: number;
}): Promise<ActiveRoomCheckResult> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutTask = new Promise<ActiveRoomCheckResult>((resolve) => {
    timeoutId = setTimeout(() => {
      check.abortForTimeout();
      resolve(buildTimedOutActiveRoomCheckResult({
        generation: check.generation,
        requestId: check.requestId,
        routeKey: routeKey ?? check.routeKey,
        source: check.source,
        startedAtMs: check.startedAtMs,
      }));
    }, hardTimeoutMs);
  });

  return Promise.race([
    check.promise.then((completed) => mapCompletedActiveRoomCheckForCaller(completed, {
      routeKey,
      reused,
      skipped,
      uiTimeoutMs,
    })),
    timeoutTask,
  ]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

export async function runActiveRoomCheck({
  fetcher,
  hardTimeoutMs = ACTIVE_ROOM_CHECK_UI_TIMEOUT_MS,
  routeKey = null,
  staleResultMs = ACTIVE_ROOM_CHECK_STALE_RESULT_MS,
  source,
  throttleMs = DEFAULT_THROTTLE_MS_BY_SOURCE[source],
  uiTimeoutMs = ACTIVE_ROOM_CHECK_UI_TIMEOUT_MS,
}: ActiveRoomCheckOptions): Promise<ActiveRoomCheckResult> {
  const ownerKey = buildActiveRoomCheckRegistryKey(source);
  const existingCheck = getInFlightActiveRoomCheck(ownerKey);

  if (existingCheck) {
    const nowMs = getNowMs();
    if (shouldLogSuppressedActiveRoomCheckEvent(`reuse:${source}:${existingCheck.requestId}`, nowMs)) {
      rgPerfMark('active room check reuse', {
        ownerSource: existingCheck.source,
        requestId: existingCheck.requestId,
        source,
      });
    }

    return {
      ...await raceActiveRoomCheckWithTimeout({
        check: existingCheck,
        hardTimeoutMs,
        routeKey,
        reused: true,
        skipped: false,
        uiTimeoutMs,
      }),
      reused: true,
    };
  }

  const nowMs = getNowMs();
  const lastCheck = getLastActiveRoomCheck(source);

  if (lastCheck && nowMs - lastCheck.completedAtMs < throttleMs) {
    if (shouldLogSuppressedActiveRoomCheckEvent(`skipped:${source}:${lastCheck.requestId}`, nowMs)) {
      rgPerfMark('active room check skipped', {
        ageMs: nowMs - lastCheck.completedAtMs,
        reason: 'throttle',
        requestId: lastCheck.requestId,
        source,
        throttleMs,
      });
    }

    return {
      completedAtMs: lastCheck.completedAtMs,
      generation: lastCheck.generation,
      payload: lastCheck.payload,
      requestId: lastCheck.requestId,
      routeKey,
      reused: false,
      skipped: true,
      stale: false,
      startedAtMs: lastCheck.startedAtMs,
      timedOut: false,
    };
  }

  const requestId = createActiveRoomCheckRequestId(source);
  const generation = createActiveRoomCheckGeneration();
  const startedAtMs = getNowMs();
  const abortController = new AbortController();
  let ownerCleanedUp = false;
  let timeoutLogged = false;
  const endActiveRoomCheckTrace = rgPerfMeasureStart('active room check', {
    generation,
    requestId,
    routeKey,
    source,
  });

  const cleanupOwner = (reason: 'completed' | 'error' | 'timeout') => {
    cleanupInFlightActiveRoomCheck(ownerKey, requestId);
    if (ownerCleanedUp) {
      return;
    }

    ownerCleanedUp = true;
    rgPerfMark('active room check owner cleaned up', {
      ownerKey,
      reason,
      requestId,
      source,
    });
  };

  const abortForTimeout = () => {
    if (timeoutLogged) {
      return;
    }

    timeoutLogged = true;
    rgPerfMark('active room check aborted timeout', {
      generation,
      ownerKey,
      requestId,
      routeKey,
      source,
    });
    abortController.abort();
    cleanupOwner('timeout');
  };

  const buildAbortedCompletedCheck = (completedAtMs: number): CompletedActiveRoomCheck => {
    const durationMs = completedAtMs - startedAtMs;
    rgPerfMark('active room check result ignored after abort', {
      durationMs,
      generation,
      ownerKey,
      requestId,
      routeKey,
      source,
    });

    return {
      aborted: true,
      completedAtMs,
      durationMs,
      generation,
      payload: null,
      requestId,
      routeKey,
      source,
      startedAtMs,
      stale: true,
    };
  };

  const promise = Promise.resolve()
    .then(async () => {
      const activeFetcher = fetcher ?? (await import('@/services/matchService')).fetchRunningMatchRoom;
      return activeFetcher(abortController.signal);
    })
    .then((payload) => {
      const completedAtMs = getNowMs();
      if (abortController.signal.aborted) {
        return buildAbortedCompletedCheck(completedAtMs);
      }

      const durationMs = completedAtMs - startedAtMs;
      const stale = durationMs >= staleResultMs;
      endActiveRoomCheckTrace({
        generation,
        requestId,
        routeKey,
        roomId: payload.room?.roomId ?? null,
        stale,
        success: true,
      });
      if (stale) {
        rgPerfMark('active room result skipped stale generation', {
          durationMs,
          generation,
          requestId,
          routeKey,
          source,
        });
      } else {
        setLastActiveRoomCheck(source, {
          completedAtMs,
          generation,
          payload,
          requestId,
          routeKey,
          startedAtMs,
        });
      }
      return {
        aborted: false,
        completedAtMs,
        durationMs,
        generation,
        payload,
        requestId,
        routeKey,
        source,
        startedAtMs,
        stale,
      };
    })
    .catch((error: unknown) => {
      if (abortController.signal.aborted) {
        return buildAbortedCompletedCheck(getNowMs());
      }

      endActiveRoomCheckTrace({
        generation,
        requestId,
        routeKey,
        success: false,
      });
      throw error;
    })
    .finally(() => {
      cleanupOwner(abortController.signal.aborted ? 'timeout' : 'completed');
    });

  // Register before dynamic imports or network work start so concurrent callers share this request.
  const activeCheck = startInFlightActiveRoomCheck(ownerKey, () => ({
    abortForTimeout,
    generation,
    ownerKey,
    promise,
    requestId,
    routeKey,
    source,
    startedAtMs,
  }));

  return raceActiveRoomCheckWithTimeout({
    check: activeCheck,
    hardTimeoutMs,
    routeKey,
    reused: false,
    skipped: false,
    uiTimeoutMs,
  });
}

export function resetActiveRoomCheckForTest() {
  resetActiveRoomCheckRegistryForTest();
}
