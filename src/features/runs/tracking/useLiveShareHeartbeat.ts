import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { BackgroundRunTrackingSnapshot } from '@/features/runs/tracking/background';
import type { SyncLiveSharingInput } from '@/features/runs/types/runTrackingFlow';
import { updateRunningLiveShare } from '@/services/runningService';

type UseLiveShareHeartbeatInput = {
  liveShareEnabledRef: MutableRefObject<boolean>;
  liveShareLabelRef: MutableRefObject<string | null>;
  liveShareHeartbeatRef: MutableRefObject<number>;
  setLiveShareLabel: Dispatch<SetStateAction<string | null>>;
};

export function useLiveShareHeartbeat({
  liveShareEnabledRef,
  liveShareLabelRef,
  liveShareHeartbeatRef,
  setLiveShareLabel,
}: UseLiveShareHeartbeatInput) {
  const syncLiveSharing = useCallback(async ({
    enabled,
    status: nextStatus,
    locationLabel,
  }: SyncLiveSharingInput) => {
    const payload = await updateRunningLiveShare({
      enabled,
      status: nextStatus,
      ...(locationLabel ? { locationLabel } : {}),
    });

    setLiveShareLabel(payload.locationLabel ?? null);
    liveShareHeartbeatRef.current = payload.isRunningNow ? Date.now() : 0;
    return payload;
  }, [liveShareHeartbeatRef, setLiveShareLabel]);

  const refreshLiveSharingHeartbeat = useCallback((snapshot: BackgroundRunTrackingSnapshot) => {
    if (!liveShareEnabledRef.current || snapshot.status !== 'running') {
      return;
    }

    const now = Date.now();

    if (now - liveShareHeartbeatRef.current < 25000) {
      return;
    }

    liveShareHeartbeatRef.current = now;
    void syncLiveSharing({
      enabled: true,
      status: 'running',
      locationLabel: liveShareLabelRef.current,
    }).catch(() => {
      // Keep the run going even if the optional live-share heartbeat fails.
    });
  }, [
    liveShareEnabledRef,
    liveShareHeartbeatRef,
    liveShareLabelRef,
    syncLiveSharing,
  ]);

  return {
    refreshLiveSharingHeartbeat,
    syncLiveSharing,
  };
}
