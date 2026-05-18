import type {
  ActiveRoomCheckResult,
  ActiveRoomCheckResultSkipReason,
  ActiveRoomCheckSource,
  CompletedActiveRoomCheck,
} from '@/features/runs/sync/activeRoomCheckTypes';

export function buildTimedOutActiveRoomCheckResult({
  generation,
  requestId,
  routeKey,
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

export function mapCompletedActiveRoomCheckForCaller(
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
