import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { BackgroundRunTrackingSnapshot } from '@/features/runs/tracking/background';
import type { SyncLiveSharingInput } from '@/features/runs/types/runTrackingFlow';
import { updateRunningLiveShare } from '@/services/runningService';
import { areCheerAlertsEnabled, isLiveRunPublic } from '@/features/runs/cheer/liveRunSettingsStore';
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
    // 러닝 하트비트 응답에서만 말한다: 종료/정리 호출(enabled:false)에 실려온 잔여 응원을
    // 러닝이 끝난 뒤 말하면 안 된다(적대 검증 발견).
    if (enabled && nextStatus === 'running' && payload.cheers?.length) {
      void speakCheers(payload.cheers);
    }

    return payload;
  }, [liveShareHeartbeatRef, setLiveShareLabel]);

  const refreshLiveSharingHeartbeat = useCallback((snapshot: BackgroundRunTrackingSnapshot) => {
    if (!liveShareEnabledRef.current || snapshot.status !== 'running') {
      return;
    }

    // 미드런 비공개 전환 (적대 검증 발견): 설정 저장은 모듈 스토어에 즉시 반영되지만
    // liveShareEnabledRef는 마운트 시점 값이라 여기서 스토어를 직접 본다. 꺼졌으면 서버
    // 엔트리를 즉시 철회해 친구 화면에서 2분 신선도 창을 기다리지 않고 사라지게 한다.
    if (!isLiveRunPublic()) {
      if (liveShareHeartbeatRef.current !== 0) {
        liveShareHeartbeatRef.current = 0;
        void syncLiveSharing({ enabled: false, status: 'idle' }).catch(() => {});
      }
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
