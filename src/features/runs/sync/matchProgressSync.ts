import type {
  RunningMatchStatusResponse,
  UpdateRunningMatchProgressInput,
} from '@/lib/api/types';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  normalizeMatchProgressPace,
  type LastSyncedMatchProgress,
} from '@/features/runs/viewModels/matchProgress';
import { LIVE_MATCH_SERVER_SYNC_INTERVAL_MS } from '@/features/runs/sync/liveMatchCadence';
import { buildAveragePace } from '@/features/runs/tracking';

export const MATCH_PROGRESS_HEARTBEAT_INTERVAL_MS = LIVE_MATCH_SERVER_SYNC_INTERVAL_MS;
// Keep aligned with backend MATCH_GOAL_DISTANCE_TOLERANCE_KM for boundary rounding margin.
export const MATCH_GOAL_DISTANCE_TOLERANCE_KM = 0.02;

export type MatchProgressRoomContext = {
  mode: 'duel' | 'group';
  matchId: string;
  distanceKm: number;
  state: 'matched' | 'active';
} | null;

export type ActiveMatchProgressTarget = {
  matchId: string;
  distanceKm: number;
} | null;

export function resolveMatchProgressHeartbeatStatus({
  progressDistanceKm,
  targetDistanceKm,
}: {
  progressDistanceKm: number;
  targetDistanceKm: number;
}): Extract<UpdateRunningMatchProgressInput['status'], 'running' | 'finished'> {
  return progressDistanceKm >= targetDistanceKm - MATCH_GOAL_DISTANCE_TOLERANCE_KM
    ? 'finished'
    : 'running';
}

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
      distanceKm: duelMatchStatus.distanceKm,
    };
  }

  if (matchMode === 'group' && groupMatchStatus?.state === 'active' && groupMatchStatus.matchId) {
    return {
      matchId: groupMatchStatus.matchId,
      distanceKm: groupMatchStatus.distanceKm,
    };
  }

  if (
    roomLinkedMatchContext
    && roomLinkedMatchContext.state === 'active'
    && matchMode === roomLinkedMatchContext.mode
  ) {
    return {
      matchId: roomLinkedMatchContext.matchId,
      distanceKm: roomLinkedMatchContext.distanceKm,
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
