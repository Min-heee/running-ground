import type { RunningMatchRoomResponse } from '@/lib/api/types';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import { createKeyedRequestRegistry } from '@/utils/rgKeyedRegistry';
import { buildActiveRoomRegistryKey } from '@/features/runs/sync/registryKeys';

export type ActiveRoomCheckSource = 'track-run experience' | 'match-room snapshot';

type ActiveRoomCheckOptions = {
  fetcher?: (signal?: AbortSignal) => Promise<RunningMatchRoomResponse>;
  hardTimeoutMs?: number;
  routeKey?: string | null;
  staleResultMs?: number;
  source: ActiveRoomCheckSource;
  throttleMs?: number;
  uiTimeoutMs?: number;
};

type ActiveRoomCheckResult = {
  completedAtMs: number | null;
  generation: number;
  payload: RunningMatchRoomResponse | null;
  requestId: string;
  routeKey: string | null;
  reused: boolean;
  skipped: boolean;
  stale: boolean;
  startedAtMs: number;
  timedOut: boolean;
};

type InFlightActiveRoomCheck = {
  abortForTimeout: () => void;
  generation: number;
  ownerKey: string;
  promise: Promise<CompletedActiveRoomCheck>;
  requestId: string;
  routeKey: string | null;
  source: ActiveRoomCheckSource;
  startedAtMs: number;
};

type LastActiveRoomCheck = {
  completedAtMs: number;
  generation: number;
  payload: RunningMatchRoomResponse;
  requestId: string;
  routeKey: string | null;
  startedAtMs: number;
};

type CompletedActiveRoomCheck = {
  aborted: boolean;
  completedAtMs: number;
  durationMs: number;
  generation: number;
  payload: RunningMatchRoomResponse | null;
  requestId: string;
  routeKey: string | null;
  source: ActiveRoomCheckSource;
  startedAtMs: number;
  stale: boolean;
};

export type ActiveRoomCheckResultSkipReason =
  | 'timed-out'
  | 'stale-generation'
  | 'route-changed'
  | 'live-match-mounted';

const ACTIVE_ROOM_CHECK_UI_TIMEOUT_MS = 3_000;
const ACTIVE_ROOM_CHECK_STALE_RESULT_MS = 5_000;
const DEFAULT_THROTTLE_MS_BY_SOURCE: Record<ActiveRoomCheckSource, number> = {
  'track-run experience': 5_000,
  'match-room snapshot': 700,
};
const SUPPRESSED_LOG_INTERVAL_MS = 2_000;

let nextRequestSequence = 0;
let nextGeneration = 0;
const inFlightChecks = createKeyedRequestRegistry<InFlightActiveRoomCheck>();
const lastChecksBySource = new Map<ActiveRoomCheckSource, LastActiveRoomCheck>();
const suppressedLogTimes = new Map<string, number>();

function getNowMs() {
  return Date.now();
}

function createRequestId(source: ActiveRoomCheckSource) {
  nextRequestSequence += 1;
  return `${source.replace(/[^a-z0-9]+/gi, '-')}-${nextRequestSequence}`;
}

function buildActiveRoomCheckRegistryKey(source: ActiveRoomCheckSource) {
  return buildActiveRoomRegistryKey('current-user', source);
}

function shouldLogSuppressedEvent(key: string, nowMs: number) {
  const lastLogAtMs = suppressedLogTimes.get(key) ?? 0;
  if (nowMs - lastLogAtMs < SUPPRESSED_LOG_INTERVAL_MS) {
    return false;
  }

  suppressedLogTimes.set(key, nowMs);
  return true;
}

function buildTimedOutResult({
  generation,
  requestId,
  routeKey,
  source,
  startedAtMs,
}: {
  generation: number;
  requestId: string;
  routeKey: string | null;
  source: ActiveRoomCheckSource;
  startedAtMs: number;
}): ActiveRoomCheckResult {
  return {
    completedAtMs: null,
    generation,
    payload: null,
    requestId,
    routeKey,
    reused: false,
    skipped: false,
    stale: true,
    startedAtMs,
    timedOut: true,
  };
}

function toResultForCaller(
  completed: CompletedActiveRoomCheck,
  {
    routeKey,
    reused,
    skipped,
    uiTimeoutMs,
  }: {
    routeKey?: string | null;
    reused: boolean;
    skipped: boolean;
    uiTimeoutMs: number;
  },
): ActiveRoomCheckResult {
  if (completed.aborted) {
    return {
      completedAtMs: null,
      generation: completed.generation,
      payload: null,
      requestId: completed.requestId,
      routeKey: routeKey ?? completed.routeKey,
      reused,
      skipped,
      stale: true,
      startedAtMs: completed.startedAtMs,
      timedOut: true,
    };
  }

  return {
    completedAtMs: completed.completedAtMs,
    generation: completed.generation,
    payload: completed.payload,
    requestId: completed.requestId,
    routeKey: routeKey ?? completed.routeKey,
    reused,
    skipped,
    stale: completed.stale || completed.durationMs >= uiTimeoutMs,
    startedAtMs: completed.startedAtMs,
    timedOut: false,
  };
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
      resolve(buildTimedOutResult({
        generation: check.generation,
        requestId: check.requestId,
        routeKey: routeKey ?? check.routeKey,
        source: check.source,
        startedAtMs: check.startedAtMs,
      }));
    }, hardTimeoutMs);
  });

  return Promise.race([
    check.promise.then((completed) => toResultForCaller(completed, {
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

export function getActiveRoomCheckResultSkipReason({
  currentMatchId,
  currentRouteKey,
  isLiveMatchMounted,
  result,
}: {
  currentMatchId?: string | null;
  currentRouteKey?: string | null;
  isLiveMatchMounted?: boolean;
  result: ActiveRoomCheckResult;
}): ActiveRoomCheckResultSkipReason | null {
  if (result.timedOut) {
    return 'timed-out';
  }

  if (result.stale) {
    return 'stale-generation';
  }

  if (currentRouteKey && result.routeKey && currentRouteKey !== result.routeKey) {
    return 'route-changed';
  }

  if (isLiveMatchMounted) {
    const room = result.payload?.room ?? null;
    if (!room || room.state === 'waiting' || room.state === 'arming' || room.state === 'countdown') {
      return 'live-match-mounted';
    }

    if (currentMatchId && room.linkedMatchId && room.linkedMatchId !== currentMatchId) {
      return 'live-match-mounted';
    }
  }

  return null;
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
  const existingCheck = inFlightChecks.get(ownerKey);

  if (existingCheck) {
    const nowMs = getNowMs();
    if (shouldLogSuppressedEvent(`reuse:${source}:${existingCheck.requestId}`, nowMs)) {
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
  const lastCheck = lastChecksBySource.get(source);

  if (lastCheck && nowMs - lastCheck.completedAtMs < throttleMs) {
    if (shouldLogSuppressedEvent(`skipped:${source}:${lastCheck.requestId}`, nowMs)) {
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

  const requestId = createRequestId(source);
  nextGeneration += 1;
  const generation = nextGeneration;
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
    inFlightChecks.deleteIf(ownerKey, (activeCheck) => activeCheck.requestId === requestId);
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
        lastChecksBySource.set(source, {
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
  const { request: activeCheck } = inFlightChecks.start(ownerKey, () => ({
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
  nextRequestSequence = 0;
  nextGeneration = 0;
  inFlightChecks.clear();
  lastChecksBySource.clear();
  suppressedLogTimes.clear();
}
