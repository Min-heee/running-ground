// chase 전용 지오 헬퍼 — routing.mjs의 하버사인은 모듈 프라이빗이라 여기 독립 구현.
// 경기장 스케일(수백 m~1km)에서는 로컬 평면 근사(ENU)가 충분히 정확하고 벡터 연산이 쉽다.

const EARTH_RADIUS_METERS = 6371000;

export function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function distanceBetweenMeters(start, end) {
  const startLatRad = toRadians(start.latitude);
  const endLatRad = toRadians(end.latitude);
  const deltaLat = toRadians(end.latitude - start.latitude);
  const deltaLng = toRadians(end.longitude - start.longitude);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(startLatRad) * Math.cos(endLatRad) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// origin 기준 동(x)/북(y) 미터 오프셋 — 방향/추월 판정용 로컬 평면 좌표.
export function localOffsetMeters(origin, point) {
  const metersPerLatDegree = 111_320;
  const metersPerLngDegree = 111_320 * Math.cos(toRadians(origin.latitude));
  return {
    x: (point.longitude - origin.longitude) * metersPerLngDegree,
    y: (point.latitude - origin.latitude) * metersPerLatDegree,
  };
}

export function isInsideArena(point, arena, marginM = 0) {
  return (
    distanceBetweenMeters(point, { latitude: arena.latitude, longitude: arena.longitude }) <=
    arena.radiusM + marginM
  );
}

export function vectorLength(vector) {
  return Math.hypot(vector.x, vector.y);
}

// 두 벡터 사이 각도(도). 영벡터가 섞이면 null.
export function angleBetweenDegrees(a, b) {
  const lengthA = vectorLength(a);
  const lengthB = vectorLength(b);

  if (lengthA <= 0 || lengthB <= 0) {
    return null;
  }

  const cosine = Math.min(1, Math.max(-1, (a.x * b.x + a.y * b.y) / (lengthA * lengthB)));
  return (Math.acos(cosine) * 180) / Math.PI;
}
