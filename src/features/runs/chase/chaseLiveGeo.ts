// 라이브 지도용 소형 지오 헬퍼 — 경기장 스케일(수백 m)에서 충분한 로컬 평면 근사.

export type LatLng = { latitude: number; longitude: number };

const METERS_PER_LAT_DEGREE = 111_320;

export function metersPerLngDegree(latitude: number) {
  return METERS_PER_LAT_DEGREE * Math.cos((latitude * Math.PI) / 180);
}

// origin 기준 동(x)/북(y) 미터 오프셋.
export function localOffsetMeters(origin: LatLng, point: LatLng) {
  return {
    x: (point.longitude - origin.longitude) * metersPerLngDegree(origin.latitude),
    y: (point.latitude - origin.latitude) * METERS_PER_LAT_DEGREE,
  };
}

// 북=0°, 시계방향 진행 방위각.
export function headingDegreesBetween(from: LatLng, to: LatLng) {
  const offset = localOffsetMeters(from, to);
  const magnitude = Math.hypot(offset.x, offset.y);

  if (magnitude < 5) {
    return null; // 5m 미만 변위는 방향으로 신뢰하지 않는다 (GPS 노이즈).
  }

  return (Math.atan2(offset.x, offset.y) * (180 / Math.PI) + 360) % 360;
}

export function latitudeDeltaForRadius(radiusM: number) {
  // 경기장 지름 + 30% 여유가 화면에 들어오는 세로 스팬.
  return (radiusM * 2 * 1.3) / METERS_PER_LAT_DEGREE;
}
