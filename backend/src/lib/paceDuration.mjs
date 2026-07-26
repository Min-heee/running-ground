// 페이스('MM:SS/km') × 거리(km) = 시간(초). 페이스는 시간/거리의 등식이므로
// 이 도출은 추정이 아니라 계산이다 — 수동 기록처럼 시간이 입력되지 않는 경로의
// durationSeconds를 여기서 채운다 (홈 '내 러닝 기록' 시간 합계 0:00 버그의 근치).

export function parsePaceSecondsPerKm(pace) {
  const match = /^(\d{1,3}):(\d{2})\/km$/.exec(String(pace ?? '').trim());

  if (!match) {
    return null;
  }

  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return seconds > 0 ? seconds : null;
}

export function deriveDurationSecondsFromPace(pace, distanceKm) {
  const paceSeconds = parsePaceSecondsPerKm(pace);

  if (paceSeconds === null || !Number.isFinite(distanceKm) || distanceKm <= 0) {
    return null;
  }

  return Math.round(paceSeconds * distanceKm);
}
