import { useMemo } from 'react';
import { useRunTracking } from '@/features/runs/hooks/useRunTracking';

export function useRunTrackingController() {
  const tracking = useRunTracking();
  const flags = useMemo(() => ({
    isIdle: tracking.status === 'idle',
    isStarting: tracking.status === 'starting',
    isRunning: tracking.status === 'running',
    isPaused: tracking.status === 'paused',
    isSaving: tracking.status === 'saving',
  }), [tracking.status]);

  return {
    ...tracking,
    ...flags,
  };
}
