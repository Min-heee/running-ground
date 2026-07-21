import { useCallback } from 'react';
import { resetBackgroundRunTracking } from '@/features/runs/tracking/background';
import { getApiErrorMessage } from '@/services/apiError';
import type { RgPerfEndTrace, StopTrackingActionInput } from './types';

export function useStopTrackingAction({
  finishSoloStartCountdown,
  setError,
  setStatus,
  stopForegroundTrackingHelpers,
  syncLiveSharing,
}: StopTrackingActionInput) {
  const handleStartFailure = useCallback(async (
    trackingError: unknown,
    endGpsStartTrace: RgPerfEndTrace,
  ) => {
    endGpsStartTrace({ success: false });
    finishSoloStartCountdown(false);
    setError(getApiErrorMessage(trackingError, '러닝 측정을 시작하지 못했어요.'));
    stopForegroundTrackingHelpers();
    await resetBackgroundRunTracking();
    void syncLiveSharing({
      enabled: false,
      status: 'idle',
    }).catch(() => {});
    setStatus('idle');
  }, [
    finishSoloStartCountdown,
    setError,
    setStatus,
    stopForegroundTrackingHelpers,
    syncLiveSharing,
  ]);

  return {
    handleStartFailure,
  };
}
