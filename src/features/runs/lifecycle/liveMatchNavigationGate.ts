import type { RunningMatchStatusResponse } from '@/lib/api/types';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';

export const LIVE_MATCH_NAVIGATION_RECENT_WINDOW_MS = 3_000;

type LiveMatchNavigationMode = Extract<RunMatchMode, 'duel' | 'group'>;

export type LiveMatchNavigationInput = {
  distanceKm?: number;
  isTestMatch?: boolean;
  matchId?: string;
  mode: LiveMatchNavigationMode;
  slotStartAt?: string;
};

export type LiveMatchNavigationResult = RunningMatchStatusResponse | null;

export function buildLiveMatchNavigationKey({
  distanceKm,
  isTestMatch,
  matchId,
  mode,
  slotStartAt,
}: LiveMatchNavigationInput) {
  if (matchId) {
    return `${mode}:match:${matchId}`;
  }

  return [
    mode,
    'slot',
    slotStartAt ?? 'auto',
    Number.isFinite(distanceKm) ? String(distanceKm) : 'auto',
    isTestMatch ? 'test' : 'live',
  ].join(':');
}

export function shouldPromoteLiveMatchArena({
  currentPreferArena = false,
  matchState,
  requestedPreferArena,
}: {
  currentPreferArena?: boolean;
  matchState?: string | null;
  requestedPreferArena: boolean;
}) {
  return Boolean(requestedPreferArena || currentPreferArena || matchState === 'active');
}

export function shouldReuseRecentLiveMatchNavigation({
  completedAtMs,
  lastKey,
  nextKey,
  nowMs,
  windowMs = LIVE_MATCH_NAVIGATION_RECENT_WINDOW_MS,
}: {
  completedAtMs?: number;
  lastKey?: string | null;
  nextKey: string;
  nowMs: number;
  windowMs?: number;
}) {
  return Boolean(
    lastKey
    && lastKey === nextKey
    && typeof completedAtMs === 'number'
    && nowMs - completedAtMs <= windowMs,
  );
}
