import {
  flushBackgroundMatchProgressSync,
} from '@/features/runs/tracking/background/backgroundMatchProgressSync';

export const ANDROID_BACKGROUND_MATCH_PROGRESS_TIMER_MS = 3_000;

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
  if (!enabled || platformOS !== 'android') {
    stopBackgroundMatchProgressTimer(clearIntervalFn);
    return false;
  }

  if (backgroundMatchProgressTimer) {
    return false;
  }

  const runFlush = flush ?? (() => flushBackgroundMatchProgressSync({ platform: platformOS }));

  backgroundMatchProgressTimer = setIntervalFn(() => {
    void runFlush().catch(() => false);
  }, ANDROID_BACKGROUND_MATCH_PROGRESS_TIMER_MS);
  return true;
}
