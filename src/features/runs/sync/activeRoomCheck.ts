import type { RunningMatchRoomResponse } from '@/lib/api/types';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';

export type ActiveRoomCheckSource = 'track-run experience' | 'match-room snapshot';

type ActiveRoomCheckOptions = {
  fetcher?: () => Promise<RunningMatchRoomResponse>;
  source: ActiveRoomCheckSource;
  throttleMs?: number;
};

type ActiveRoomCheckResult = {
  payload: RunningMatchRoomResponse;
  requestId: string;
  reused: boolean;
  skipped: boolean;
};

type InFlightActiveRoomCheck = {
  promise: Promise<RunningMatchRoomResponse>;
  requestId: string;
  source: ActiveRoomCheckSource;
};

type LastActiveRoomCheck = {
  completedAtMs: number;
  payload: RunningMatchRoomResponse;
  requestId: string;
};

const ACTIVE_ROOM_CHECK_KEY = 'current-user-active-room';
const DEFAULT_THROTTLE_MS_BY_SOURCE: Record<ActiveRoomCheckSource, number> = {
  'track-run experience': 5_000,
  'match-room snapshot': 700,
};
const SUPPRESSED_LOG_INTERVAL_MS = 2_000;

let nextRequestSequence = 0;
const inFlightChecks = new Map<string, InFlightActiveRoomCheck>();
const lastChecksBySource = new Map<ActiveRoomCheckSource, LastActiveRoomCheck>();
const suppressedLogTimes = new Map<string, number>();

function getNowMs() {
  return Date.now();
}

function createRequestId(source: ActiveRoomCheckSource) {
  nextRequestSequence += 1;
  return `${source.replace(/[^a-z0-9]+/gi, '-')}-${nextRequestSequence}`;
}

function shouldLogSuppressedEvent(key: string, nowMs: number) {
  const lastLogAtMs = suppressedLogTimes.get(key) ?? 0;
  if (nowMs - lastLogAtMs < SUPPRESSED_LOG_INTERVAL_MS) {
    return false;
  }

  suppressedLogTimes.set(key, nowMs);
  return true;
}

export async function runActiveRoomCheck({
  fetcher,
  source,
  throttleMs = DEFAULT_THROTTLE_MS_BY_SOURCE[source],
}: ActiveRoomCheckOptions): Promise<ActiveRoomCheckResult> {
  const existingCheck = inFlightChecks.get(ACTIVE_ROOM_CHECK_KEY);

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
      payload: await existingCheck.promise,
      requestId: existingCheck.requestId,
      reused: true,
      skipped: false,
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
      payload: lastCheck.payload,
      requestId: lastCheck.requestId,
      reused: false,
      skipped: true,
    };
  }

  const requestId = createRequestId(source);
  const endActiveRoomCheckTrace = rgPerfMeasureStart('active room check', {
    requestId,
    source,
  });

  const promise = Promise.resolve()
    .then(async () => {
      const activeFetcher = fetcher ?? (await import('@/services/matchService')).fetchRunningMatchRoom;
      return activeFetcher();
    })
    .then((payload) => {
      endActiveRoomCheckTrace({
        requestId,
        roomId: payload.room?.roomId ?? null,
        success: true,
      });
      lastChecksBySource.set(source, {
        completedAtMs: getNowMs(),
        payload,
        requestId,
      });
      return payload;
    })
    .catch((error: unknown) => {
      endActiveRoomCheckTrace({
        requestId,
        success: false,
      });
      throw error;
    })
    .finally(() => {
      const activeCheck = inFlightChecks.get(ACTIVE_ROOM_CHECK_KEY);
      if (activeCheck?.requestId === requestId) {
        inFlightChecks.delete(ACTIVE_ROOM_CHECK_KEY);
      }
    });

  // Register before dynamic imports or network work start so concurrent callers share this request.
  inFlightChecks.set(ACTIVE_ROOM_CHECK_KEY, {
    promise,
    requestId,
    source,
  });

  return {
    payload: await promise,
    requestId,
    reused: false,
    skipped: false,
  };
}

export function resetActiveRoomCheckForTest() {
  nextRequestSequence = 0;
  inFlightChecks.clear();
  lastChecksBySource.clear();
  suppressedLogTimes.clear();
}
