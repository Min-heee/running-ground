import type {
  RunningMatchStatusResponse,
  UpdateRunningMatchProgressInput,
} from '@/lib/api/types';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  normalizeMatchProgressPace,
  type LastSyncedMatchProgress,
} from '@/features/runs/matchProgress';
import { buildAveragePace } from '@/features/runs/tracking';

export const MATCH_PROGRESS_HEARTBEAT_INTERVAL_MS = 2000;

export type MatchProgressRoomContext = {
  mode: 'duel' | 'group';
  matchId: string;
  state: 'matched' | 'active';
} | null;

export type ActiveMatchProgressTarget = {
  matchId: string;
} | null;

export function buildSyncedMatchProgressSnapshot(
  input: UpdateRunningMatchProgressInput,
  nowMs = Date.now(),
): LastSyncedMatchProgress {
  const progressAveragePace = buildAveragePace(input.distanceKm, input.elapsedSeconds);
  const normalizedCurrentPace = normalizeMatchProgressPace(input.currentPace, progressAveragePace);

  return {
    matchId: input.matchId,
    distanceKm: input.distanceKm,
    elapsedSeconds: input.elapsedSeconds,
    currentPace: normalizedCurrentPace,
    updatedAt: nowMs,
  };
}

export function resolveActiveMatchProgressTarget({
  matchMode,
  duelMatchStatus,
  groupMatchStatus,
  roomLinkedMatchContext,
}: {
  matchMode: RunMatchMode;
  duelMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatus: RunningMatchStatusResponse | null;
  roomLinkedMatchContext: MatchProgressRoomContext;
}): ActiveMatchProgressTarget {
  if (matchMode === 'duel' && duelMatchStatus?.state === 'active' && duelMatchStatus.matchId) {
    return {
      matchId: duelMatchStatus.matchId,
    };
  }

  if (matchMode === 'group' && groupMatchStatus?.state === 'active' && groupMatchStatus.matchId) {
    return {
      matchId: groupMatchStatus.matchId,
    };
  }

  if (
    roomLinkedMatchContext
    && roomLinkedMatchContext.state === 'active'
    && matchMode === roomLinkedMatchContext.mode
  ) {
    return {
      matchId: roomLinkedMatchContext.matchId,
    };
  }

  return null;
}

export function shouldSendMatchProgressHeartbeat({
  trackingStatus,
  lastHeartbeatAt,
  nowMs,
  intervalMs = MATCH_PROGRESS_HEARTBEAT_INTERVAL_MS,
}: {
  trackingStatus: 'idle' | 'running' | 'paused';
  lastHeartbeatAt: number;
  nowMs: number;
  intervalMs?: number;
}) {
  return trackingStatus === 'running' && nowMs - lastHeartbeatAt >= intervalMs;
}
