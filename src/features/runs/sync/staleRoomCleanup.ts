import type { RunningMatchRoomCleanupResponse } from '@/lib/api/types';
import { getApiErrorMessage, isApiError } from '@/services/apiError';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';

export const STALE_ROOM_CLEANUP_TIMEOUT_MS = 1500;

export type StaleRoomCleanupOutcome =
  | { status: 'completed'; payload: RunningMatchRoomCleanupResponse }
  | { status: 'error'; error: unknown }
  | { status: 'timeout' };

export function getRunningMatchBlockerFromError(error: unknown) {
  if (!isApiError(error) || !error.details || typeof error.details !== 'object') {
    return null;
  }

  const details = error.details as {
    blocker?: unknown;
    blockerSource?: unknown;
    code?: unknown;
    message?: unknown;
  };
  const blocker = typeof details.blocker === 'string' ? details.blocker : null;
  const blockerSource = typeof details.blockerSource === 'string' ? details.blockerSource : null;

  if (!blocker && !blockerSource) {
    return null;
  }

  return {
    blocker,
    blockerSource,
    code: typeof details.code === 'string' ? details.code : null,
    message: typeof details.message === 'string' ? details.message : error.userMessage,
  };
}

export async function runStaleRoomCleanupWithTimeout({
  cleanup,
  source,
  timeoutMs = STALE_ROOM_CLEANUP_TIMEOUT_MS,
}: {
  cleanup?: () => Promise<RunningMatchRoomCleanupResponse>;
  source: string;
  timeoutMs?: number;
}): Promise<StaleRoomCleanupOutcome> {
  const endStaleCleanupTrace = rgPerfMeasureStart('stale room cleanup', {
    source,
    timeoutMs,
  });
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const cleanupTaskRunner = cleanup ?? (await import('@/services/matchService')).cleanupStaleRunningMatchRoomState;

  const cleanupTask = cleanupTaskRunner()
    .then<StaleRoomCleanupOutcome>((payload) => ({
      payload,
      status: 'completed',
    }))
    .catch<StaleRoomCleanupOutcome>((error: unknown) => ({
      error,
      status: 'error',
    }));

  const timeoutTask = new Promise<StaleRoomCleanupOutcome>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({ status: 'timeout' });
    }, timeoutMs);
  });

  const outcome = await Promise.race([cleanupTask, timeoutTask]);
  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  if (outcome.status === 'completed') {
    endStaleCleanupTrace({
      blocker: outcome.payload.blocker ?? null,
      cleaned: outcome.payload.cleaned,
      roomId: outcome.payload.room?.roomId ?? null,
      success: true,
    });
    return outcome;
  }

  if (outcome.status === 'timeout') {
    endStaleCleanupTrace({
      success: false,
      timedOut: true,
    });
    rgPerfMark('stale cleanup deferred', {
      reason: 'timeout',
      source,
      timeoutMs,
    });
    return outcome;
  }

  endStaleCleanupTrace({ success: false });
  rgPerfMark('stale room cleanup error', {
    message: getApiErrorMessage(outcome.error, '이전 방 상태를 정리하지 못했어.'),
    source,
  });
  return outcome;
}
