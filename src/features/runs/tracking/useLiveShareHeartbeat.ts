import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { BackgroundRunTrackingSnapshot } from '@/features/runs/tracking/background';
import type { SyncLiveSharingInput } from '@/features/runs/types/runTrackingFlow';
import { updateRunningLiveShare } from '@/services/runningService';
import { areCheerAlertsEnabled } from '@/features/runs/cheer/liveRunSettingsStore';
import { speakCheers } from '@/features/runs/cheer/speakCheers';

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
    latitude,
    longitude,
    distanceKm,
    paceLabel,
  }: SyncLiveSharingInput) => {
    const payload = await updateRunningLiveShare({
      enabled,
      status: nextStatus,
      ...(locationLabel ? { locationLabel } : {}),
      ...(typeof latitude === 'number' && typeof longitude === 'number' ? { latitude, longitude } : {}),
      ...(typeof distanceKm === 'number' ? { distanceKm } : {}),
      ...(paceLabel ? { paceLabel } : {}),
      // 응원 수신 허용은 설정 스토어에서 읽는다 — false면 서버가 친구의 전송 자체를 거절한다.
      allowCheers: areCheerAlertsEnabled(),
    });

    setLiveShareLabel(payload.locationLabel ?? null);
    liveShareHeartbeatRef.current = payload.isRunningNow ? Date.now() : 0;

    // 하트비트에 실려온 친구 응원 — 서버는 전달 즉시 비우므로 여기서 한 번만 들린다.
    if (payload.cheers?.length) {
      void speakCheers(payload.cheers);
    }

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
    const lastPoint = snapshot.route.length ? snapshot.route[snapshot.route.length - 1] : null;
    void syncLiveSharing({
      enabled: true,
      status: 'running',
      locationLabel: liveShareLabelRef.current,
      // 친구 라이브 지도 재료 — 마지막 GPS 점 + 현재 지표.
      ...(lastPoint ? { latitude: lastPoint.latitude, longitude: lastPoint.longitude } : {}),
      distanceKm: snapshot.distanceKm,
      paceLabel: snapshot.currentPace,
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
