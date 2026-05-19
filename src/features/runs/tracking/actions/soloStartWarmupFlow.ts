import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { StartTrackingOptions } from '@/features/runs/tracking/actions/types';

type SoloStartWarmupTraceDetail = {
  canceled?: boolean;
  success: boolean;
  status?: 'running';
  warmupMode?: boolean;
};

type RunSoloStartWarmupFlowInput = {
  commitWarmupBaseline: () => boolean | Promise<boolean>;
  endGpsStartTrace: (detail: SoloStartWarmupTraceDetail) => void;
  resetWarmupTracking: () => Promise<void>;
  runSoloStartCountdown: () => Promise<boolean>;
  startGpsWarmup: () => Promise<void>;
  syncFromBackgroundTracking: () => void;
};

export function shouldRunSoloGpsWarmupCountdown(
  matchMode: RunMatchMode,
  options?: StartTrackingOptions,
) {
  return matchMode === 'solo' && !options?.allowCountdownWarmup;
}

export async function runSoloStartWarmupFlow({
  commitWarmupBaseline,
  endGpsStartTrace,
  resetWarmupTracking,
  runSoloStartCountdown,
  startGpsWarmup,
  syncFromBackgroundTracking,
}: RunSoloStartWarmupFlowInput) {
  await startGpsWarmup();

  const countdownCompleted = await runSoloStartCountdown();

  if (!countdownCompleted) {
    await resetWarmupTracking();
    syncFromBackgroundTracking();
    endGpsStartTrace({ canceled: true, success: false });
    return false;
  }

  await commitWarmupBaseline();
  syncFromBackgroundTracking();
  endGpsStartTrace({
    success: true,
    status: 'running',
    warmupMode: true,
  });
  return true;
}
