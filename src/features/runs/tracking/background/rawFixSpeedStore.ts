import type * as Location from 'expo-location';

import { MAX_TRACKING_ACCURACY_METERS, resolveLocationTimestampMs } from './locationDistance';

// 원시 GPS 픽스 속도 — 케이던스 워치독 전용 (오너 실기기 테스트 2026-09-09).
//
// 트래커(routeAccumulator)는 8.5 m/s(시속 30km)보다 빠른 구간을 "순간이동"으로 거부하고
// 거리를 멈춘다. 그러면 스무딩 페이스가 '--:--/km'로 비고, 페이스에서 속도를 읽던 워치독은
// "속도를 모른다"며 누적을 끊는다 — 즉 **빨리 달리는 차일수록 안 잡히는** 구조였다(영상: 1:03
// 02:30/km → 1:27 --:--/km, 거리 0.68km 동결). 그래서 채택 여부와 무관하게 들어오는 모든
// 픽스의 속도를 여기 따로 기록하고, 워치독은 이 값을 먼저 본다.
//
// 속도 출처: coords.speed(기기 GPS 도플러 — 차량에서 신뢰도 높음) → 없으면 직전 원시 픽스와의
// 변위/시간. 정확도가 트래커 하드컷(40m)보다 나쁜 픽스와 비현실 속도(70 m/s↑)는 무시한다.

export type RawFixSpeedSample = {
  // 기록 시각(Date.now) — 워치독 신선도 판정용.
  atMs: number;
  speedMps: number;
};

// 시속 250km — GPS 글리치 컷. 그 아래는 차량이든 뭐든 "이동 중"으로 본다.
const MAX_PLAUSIBLE_SPEED_MPS = 70;
const MIN_DISPLACEMENT_DT_SECONDS = 0.9;
const EARTH_RADIUS_METERS = 6_371_000;

type RawFix = { latitude: number; longitude: number; timestampMs: number };

let lastSample: RawFixSpeedSample | null = null;
let lastFix: RawFix | null = null;

function haversineMeters(from: RawFix, to: RawFix) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function recordRawFixSpeed(location: Location.LocationObject, nowMs = Date.now()): void {
  const accuracy = location.coords.accuracy;

  if (typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy > MAX_TRACKING_ACCURACY_METERS) {
    return;
  }

  const timestampMs = resolveLocationTimestampMs(location) ?? nowMs;
  const fix: RawFix = { latitude: location.coords.latitude, longitude: location.coords.longitude, timestampMs };
  const reportedSpeed = location.coords.speed;
  let speedMps: number | null = typeof reportedSpeed === 'number' && Number.isFinite(reportedSpeed) && reportedSpeed >= 0
    ? reportedSpeed
    : null;

  if (speedMps === null && lastFix) {
    const dtSeconds = (fix.timestampMs - lastFix.timestampMs) / 1000;

    if (dtSeconds >= MIN_DISPLACEMENT_DT_SECONDS) {
      speedMps = haversineMeters(lastFix, fix) / dtSeconds;
    }
  }

  lastFix = fix;

  if (speedMps === null || speedMps > MAX_PLAUSIBLE_SPEED_MPS) {
    return;
  }

  lastSample = { atMs: nowMs, speedMps };
}

export function getRawFixSpeedSample(): RawFixSpeedSample | null {
  return lastSample;
}

export function resetRawFixSpeed(): void {
  lastSample = null;
  lastFix = null;
}
