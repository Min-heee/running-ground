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

// 레이 캐스팅 point-in-polygon (위경도 그대로 — 경기장 스케일에서 곡률 무시 가능).
export function isPointInPolygon(point, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses =
      (a.latitude > point.latitude) !== (b.latitude > point.latitude) &&
      point.longitude <
        ((b.longitude - a.longitude) * (point.latitude - a.latitude)) /
          (b.latitude - a.latitude) +
          a.longitude;

    if (crosses) {
      inside = !inside;
    }
  }

  return inside;
}

// 폴리곤 가장자리까지 최소 거리(미터) — 지오펜스 여유(margin) 판정용.
export function distanceToPolygonEdgeMeters(point, polygon) {
  let minDistance = Infinity;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = localOffsetMeters(point, polygon[i]);
    const b = localOffsetMeters(point, polygon[j]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq > 0 ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSq)) : 0;
    const distance = Math.hypot(a.x + t * dx, a.y + t * dy);

    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance;
}

// 경기장 판정 — polygon이 있으면 실제 공원 모양(+여유), 없으면 원형 반경.
export function isInsideArena(point, arena, marginM = 0) {
  if (Array.isArray(arena.polygon) && arena.polygon.length >= 3) {
    return (
      isPointInPolygon(point, arena.polygon) ||
      (marginM > 0 && distanceToPolygonEdgeMeters(point, arena.polygon) <= marginM)
    );
  }

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
