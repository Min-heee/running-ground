// 거리 정밀도의 단일 근원 (오너 2026-08-15).
//
// 왜 한 곳에 모으는가: 예전엔 저장·집계·표시가 각자 소수 1자리로 반올림했다. 그래서 8.15km를
// 정확히 뛴 러너가 8.1 또는 8.2로 남았고, 815런처럼 소수점이 곧 의미인 행사에서 기록이
// 어긋났다(회원G 8.2 / 회원J 8.1 — 실제 사건).
//
// 그리고 흩어진 반올림은 그 자체로 위험하다: 지역 통계(regionLiveStats)와 월간 우승 별
// (monthlyRankingStars)이 다른 자리에서 반올림하면 "화면 1위가 곧 우승"이라는 불변식이
// 깨진다. 두 곳이 같은 함수를 부르게 만들어 그 어긋남을 구조적으로 불가능하게 한다.
export const DISTANCE_DECIMALS = 2;

// 거리(km) 반올림. 정수는 정수로 남는다(10.00이 아니라 10) — 화면이 값을 그대로 찍기 때문.
export function roundDistanceKm(value) {
  const distanceKm = Number(value);

  if (!Number.isFinite(distanceKm)) {
    return 0;
  }

  return Number(distanceKm.toFixed(DISTANCE_DECIMALS));
}
