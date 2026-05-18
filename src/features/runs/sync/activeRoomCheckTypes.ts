import type { RunningMatchRoomResponse } from '@/lib/api/types';

export type ActiveRoomCheckSource = 'track-run experience' | 'match-room snapshot';

export type ActiveRoomCheckOptions = {
  fetcher?: (signal?: AbortSignal) => Promise<RunningMatchRoomResponse>;
  hardTimeoutMs?: number;
  routeKey?: string | null;
  staleResultMs?: number;
  source: ActiveRoomCheckSource;
  throttleMs?: number;
  uiTimeoutMs?: number;
};

export type ActiveRoomCheckResult = {
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

export type InFlightActiveRoomCheck = {
  abortForTimeout: () => void;
  generation: number;
  ownerKey: string;
  promise: Promise<CompletedActiveRoomCheck>;
  requestId: string;
  routeKey: string | null;
  source: ActiveRoomCheckSource;
  startedAtMs: number;
};

export type LastActiveRoomCheck = {
  completedAtMs: number;
  generation: number;
  payload: RunningMatchRoomResponse;
  requestId: string;
  routeKey: string | null;
  startedAtMs: number;
};

export type CompletedActiveRoomCheck = {
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

export const ACTIVE_ROOM_CHECK_UI_TIMEOUT_MS = 3_000;
export const ACTIVE_ROOM_CHECK_STALE_RESULT_MS = 5_000;
export const DEFAULT_THROTTLE_MS_BY_SOURCE: Record<ActiveRoomCheckSource, number> = {
  'track-run experience': 5_000,
  'match-room snapshot': 700,
};
