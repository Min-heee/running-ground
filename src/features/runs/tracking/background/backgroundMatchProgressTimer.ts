import {
  flushBackgroundMatchProgressSync,
} from '@/features/runs/tracking/background/backgroundMatchProgressSync';

// Fix A.1 — this time-based flush cadence now runs on ALL native platforms (iOS + Android), not
// just Android. Renamed to drop the misleading ANDROID_ prefix; the old name is kept as a
// back-compat alias so unrelated references do not churn.
export const BACKGROUND_MATCH_PROGRESS_TIMER_MS = 3_000;
/** @deprecated use BACKGROUND_MATCH_PROGRESS_TIMER_MS — the cadence now runs on iOS too. */
export const ANDROID_BACKGROUND_MATCH_PROGRESS_TIMER_MS = BACKGROUND_MATCH_PROGRESS_TIMER_MS;

type TimerPlatformOS = 'android' | 'ios' | 'web' | 'windows' | 'macos' | string;
type SetIntervalFn = (callback: () => void, intervalMs: number) => ReturnType<typeof setInterval>;
type ClearIntervalFn = (timer: ReturnType<typeof setInterval>) => void;

type BackgroundMatchProgressTimerOptions = {
  enabled?: boolean;
  flush?: () => Promise<unknown>;
  platformOS?: TimerPlatformOS;
  setIntervalFn?: SetIntervalFn;
  clearIntervalFn?: ClearIntervalFn;
};

let backgroundMatchProgressTimer: ReturnType<typeof setInterval> | null = null;

export function stopBackgroundMatchProgressTimer(
  clearIntervalFn: ClearIntervalFn = clearInterval,
) {
  if (!backgroundMatchProgressTimer) {
    return false;
  }

  clearIntervalFn(backgroundMatchProgressTimer);
  backgroundMatchProgressTimer = null;
  return true;
}

export function startBackgroundMatchProgressTimer({
  enabled = true,
  flush,
  platformOS,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}: BackgroundMatchProgressTimerOptions = {}) {
  // Fix A.1 — un-gate from Android-only so iOS ALSO gets a time-based flush cadence. The only
  // GPS-independent upload trigger used to be this timer, and it was Android-only, so on iOS the
  // sole screen-off trigger was a GPS fix (which goes sparse while walking) — that is the stall
  // that ballooned the opponent gap. This setInterval still suspends in TRUE background, but it
  // keeps firing across the inactive/transition windows and shrinks the stale window on iOS.
  // Only web is excluded (no native location task / background match there).
  if (!enabled || platformOS === 'web') {
    stopBackgroundMatchProgressTimer(clearIntervalFn);
    return false;
  }

  if (backgroundMatchProgressTimer) {
    return false;
  }

  const runFlush = flush ?? (() => flushBackgroundMatchProgressSync({ platform: platformOS }));

  backgroundMatchProgressTimer = setIntervalFn(() => {
    void runFlush().catch(() => false);
  }, BACKGROUND_MATCH_PROGRESS_TIMER_MS);
  return true;
}
