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

// Pure routing/guard decision for applying a BACKGROUND match-progress response into React.
// Extracted so the forfeit + mode-routing + live-id guards (the regression-prone part) are unit
// testable without rendering the runtime tree. The serverNow monotonic guard (B2) and the
// terminal teardown side-effect (M1) are applied by the caller around this decision, because they
// mutate a ref / module state; this function stays pure.
export type BackgroundMatchStatusApplyTarget = 'duel' | 'group' | null;

export function isTerminalMatchLiveStatus(
  status: RunningMatchStatusResponse['currentUserLiveStatus'] | null | undefined,
): boolean {
  return status === 'forfeited' || status === 'finished';
}

export function resolveBackgroundMatchStatusApplyTarget({
  status,
  duelMatchId,
  groupMatchId,
  roomLinkedMatchContext,
  forfeitedMatchIds,
}: {
  status: RunningMatchStatusResponse;
  duelMatchId: string | null | undefined;
  groupMatchId: string | null | undefined;
  roomLinkedMatchContext: { mode: 'duel' | 'group'; matchId: string } | null;
  forfeitedMatchIds: ReadonlySet<string>;
}): BackgroundMatchStatusApplyTarget {
  const matchId = status.matchId;
  if (!matchId) {
    return null;
  }

  // B1 — never resurrect a self-forfeited match. A background response that was in flight when
  // the user forfeited must be dropped rather than overwriting local 'forfeited' with 'active'.
  if (forfeitedMatchIds.has(matchId)) {
    return null;
  }

  // Mode-validated routing + live-id guard: only apply onto a status ref that currently holds
  // this matchId, and only when the response mode matches, so a duel response can never
  // cross-write the group status (and vice versa). Prefer the duel/group status ref over the
  // roomLinkedMatchContext for a single canonical target.
  if (status.mode === 'duel' && (
    matchId === duelMatchId
    || (matchId === roomLinkedMatchContext?.matchId && roomLinkedMatchContext.mode === 'duel')
  )) {
    return 'duel';
  }

  if (status.mode === 'group' && (
    matchId === groupMatchId
    || (matchId === roomLinkedMatchContext?.matchId && roomLinkedMatchContext.mode === 'group')
  )) {
    return 'group';
  }

  return null;
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
