import type { RunRoutePoint } from '@/domain';
import type { BackgroundRunTrackingSnapshot } from '@/features/runs/tracking/background';
import {
  buildRouteFromOfficialStart,
  type OfficialStartBaseline,
} from '@/features/runs/tracking/trackingSession';
import { calculateElevationGainM } from '@/features/runs/tracking';

export type DisplayedTrackingSnapshot = {
  route: RunRoutePoint[];
  distanceKm: number;
  elevationGainM: number;
  currentPace: string;
  elapsedSeconds: number;
  startedAt: string | null;
};

export function resolveSlotAnchoredElapsedSeconds({
  matchSlotStartAt,
  snapshot,
  syncedNowMs,
}: {
  matchSlotStartAt?: string | null;
  snapshot: BackgroundRunTrackingSnapshot;
  syncedNowMs?: number | null;
}) {
  if (
    !matchSlotStartAt
    || typeof syncedNowMs !== 'number'
    || !Number.isFinite(syncedNowMs)
  ) {
    return null;
  }

  const slotStartMs = Date.parse(matchSlotStartAt);
  if (!Number.isFinite(slotStartMs)) {
    return null;
  }

  const elapsedMs = syncedNowMs - slotStartMs - snapshot.accumulatedPausedMs;
  return Math.max(0, Math.floor(elapsedMs / 1000));
}

function resolveDisplayedElapsedSeconds({
  officialStartAnchoredElapsedSeconds,
  officialStartBaseline,
  rawElapsedSeconds,
  slotAnchoredElapsedSeconds,
}: {
  officialStartAnchoredElapsedSeconds: number | null;
  officialStartBaseline: OfficialStartBaseline | null;
  rawElapsedSeconds: number;
  slotAnchoredElapsedSeconds: number | null;
}) {
  if (slotAnchoredElapsedSeconds !== null) {
    return slotAnchoredElapsedSeconds;
  }

  if (officialStartBaseline) {
    // 공식 출발 기준의 경과도 **한 시계 안에서** 잰다: 공식 출발 시각(서버가 준 슬롯 시각)과
    // 서버 보정 now의 차. 슬롯 앵커와 완전히 같은 계산이다.
    //
    // 예전엔 원시 경과에서 기준선의 elapsedSeconds를 뺐는데, 그 기준선 자체가 '서버 슬롯 시각
    // − 기기 스탬프'라는 혼합 기준이었다. 원시 경과도 똑같이 오염돼 있어 두 오염이 상쇄될
    // 때만 맞는 값이었고, 원시 쪽을 기기 시계로 바로잡는 순간 이 뺄셈이 시계 오차만큼
    // 어긋난다(그 값은 화면에만 머물지 않는다 — 매치 진행 POST와 승부 판정의 순위 키로
    // 서버까지 간다). 상쇄에 기대지 않고 애초에 섞지 않는다.
    if (officialStartAnchoredElapsedSeconds !== null) {
      return officialStartAnchoredElapsedSeconds;
    }

    // 서버 보정 시각이 아직 없을 때만 옛 뺄셈으로 물러난다(두 항이 같은 오염을 지녀 상쇄된다).
    return Math.max(0, rawElapsedSeconds - officialStartBaseline.elapsedSeconds);
  }

  return rawElapsedSeconds;
}

export function buildDisplayedTrackingSnapshot({
  snapshot,
  rawElapsedSeconds,
  officialStartBaseline,
  hasPreStartWarmup,
  matchSlotStartAt,
  startNoiseGraceSeconds,
  startNoiseGraceKm,
  syncedNowMs,
}: {
  snapshot: BackgroundRunTrackingSnapshot;
  rawElapsedSeconds: number;
  officialStartBaseline: OfficialStartBaseline | null;
  hasPreStartWarmup: boolean;
  matchSlotStartAt?: string | null;
  startNoiseGraceSeconds: number;
  startNoiseGraceKm: number;
  syncedNowMs?: number | null;
}): DisplayedTrackingSnapshot {
  const slotAnchoredElapsedSeconds = resolveSlotAnchoredElapsedSeconds({
    matchSlotStartAt,
    snapshot,
    syncedNowMs,
  });
  const slotAnchoredStartedAt = slotAnchoredElapsedSeconds === null ? null : matchSlotStartAt ?? null;
  // 공식 출발 시각도 서버가 준 값이라 슬롯과 똑같이 앵커로 쓸 수 있다.
  const officialStartAnchoredElapsedSeconds = officialStartBaseline
    ? resolveSlotAnchoredElapsedSeconds({
      matchSlotStartAt: officialStartBaseline.startedAt,
      snapshot,
      syncedNowMs,
    })
    : null;
  const displayedElapsedSeconds = resolveDisplayedElapsedSeconds({
    officialStartAnchoredElapsedSeconds,
    officialStartBaseline,
    rawElapsedSeconds,
    slotAnchoredElapsedSeconds,
  });

  if (officialStartBaseline) {
    const adjustedRoute = buildRouteFromOfficialStart(snapshot, officialStartBaseline);
    const adjustedDistanceKm = Number(Math.max(0, snapshot.distanceKm - officialStartBaseline.distanceKm).toFixed(2));
    const shouldSuppressStartNoise = displayedElapsedSeconds <= startNoiseGraceSeconds
      && adjustedDistanceKm <= startNoiseGraceKm;
    const displayRoute = shouldSuppressStartNoise ? adjustedRoute.slice(0, 1) : adjustedRoute;

    return {
      route: displayRoute,
      distanceKm: shouldSuppressStartNoise ? 0 : adjustedDistanceKm,
      elevationGainM: shouldSuppressStartNoise ? 0 : calculateElevationGainM(displayRoute),
      currentPace: snapshot.currentPace,
      elapsedSeconds: displayedElapsedSeconds,
      startedAt: slotAnchoredStartedAt ?? officialStartBaseline.startedAt,
    };
  }

  if (hasPreStartWarmup && slotAnchoredElapsedSeconds === null) {
    return {
      route: [],
      distanceKm: 0,
      elevationGainM: 0,
      currentPace: snapshot.currentPace,
      elapsedSeconds: 0,
      startedAt: snapshot.startedAt,
    };
  }

  return {
    route: snapshot.route,
    distanceKm: snapshot.distanceKm,
    elevationGainM: snapshot.elevationGainM,
    currentPace: snapshot.currentPace,
    elapsedSeconds: displayedElapsedSeconds,
    startedAt: slotAnchoredStartedAt ?? snapshot.startedAt,
  };
}
