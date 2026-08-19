// 우주 탭 — 지역/개인을 천체로 치환하는 크기·밝기 매핑 (오너 2026-08-15).
//
// 오너 확정 매핑:
//  - 행성 = 개인. 크기 = 평생 누적 총거리의 선형 비율(은하 1등 대비), 밝기 = 이번 달 거리(로그).
//  - 항성 = 그 은하의 누적(평생) 거리 1등. 은하마다 하나뿐이다(universeBuilder.pickStarUserId).
//  - 은하 = 시/군/구, 은하군 = 시/도. 둘 다 크기 = 인당 평균, 밝기 = 총거리(로그).
//  - 은하단 = 대한민국 (최상위 프레임 — 자체 크기는 없다).
//
// 거리 기준은 리그 화면과 같은 '이번 달 전체 거리'(가져온 기록 포함) — regionLiveStats가
// 계산한 값을 그대로 받아 쓴다. 우주와 지역 보드가 다른 공식을 쓰면 한 앱 안에서 같은
// 동네가 다른 숫자로 보인다 (3.1 vs 5.1 사건, 거리 기준 통일 규칙 2026-07-31).
//
// 보정 두 개가 없으면 화면이 그냥 깨진다:
//  ① 수축 보정 — 인당 평균을 날것으로 크기에 쓰면 회원 1명짜리 지역이 한 방에 전국 최대
//     은하가 된다 (7월 첫 봉인에서 1인 지역 동구가 인당 8.9km로 실제 지역 우승을 했다).
//     표본이 작을수록 전국 평균 쪽으로 끌어당긴다: (총거리 + C×전국평균) / (회원수 + C).
//     회원 0명이면 정확히 전국 평균으로 수렴한다(분자·분모의 C항만 남는다).
//  ② 로그 밝기 — 총거리는 지역 간 수천 배 차이라(송파구 수만km vs 어느 군 200km) 선형으로
//     칠하면 최대 지역 하나만 타오르고 나머지 전국이 새까맣게 죽는다.
//
// 크기와 밝기의 기준점이 다른 건 의도다: 크기는 '전국 평균 대비'라 어느 화면에서 봐도 같은
// 지역이 같은 크기다(절대), 밝기는 '그 화면 안 최댓값 대비'라 어떤 층을 열어도 화면이
// 골고루 보인다(상대).

// 수축 사전 표본 — 회원 C명분의 전국 평균을 미리 섞는다. 5명이면 1인 지역은 전국 평균에
// 6:1로 눌리고, 회원 50명 지역은 실제값에서 10% 이내로만 움직인다.
export const SHRINKAGE_PRIOR_MEMBERS = 5;

// 은하/은하군 크기 배율 — 1.0이 전국 평균. 아래위를 막지 않으면 한 지역이 화면을 잡아먹는다.
export const MIN_GALAXY_SCALE = 0.45;
export const MAX_GALAXY_SCALE = 2.2;

// 행성 최소 크기 — 오늘 가입한 사람도 점으로는 보여야 탭할 수 있다.
export const MIN_PLANET_SCALE = 0.22;

// 이번 달에 뛴 흔적이 있으면 최소 이만큼은 빛난다. 0km면 꺼진 채로 궤도만 돈다.
export const ACTIVE_BRIGHTNESS_FLOOR = 0.15;
export const IDLE_BRIGHTNESS = 0.05;

function toNonNegativeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toFixed3(value) {
  return Number(value.toFixed(3));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// 전국 인당 평균 — 수축 보정이 끌어당기는 기준점. 회원이 없으면 기준이 없으므로 0.
export function nationwideAverageDistanceKm({ totalDistanceKm, memberCount }) {
  const total = toNonNegativeNumber(totalDistanceKm);
  const members = toNonNegativeNumber(memberCount);

  return members > 0 ? toFixed3(total / members) : 0;
}

// 수축 보정된 인당 평균 — 표본이 작을수록 전국 평균으로 끌려간다.
export function shrunkAverageDistanceKm({ totalDistanceKm, memberCount, nationwideAverageKm }) {
  const total = toNonNegativeNumber(totalDistanceKm);
  const members = toNonNegativeNumber(memberCount);
  const prior = toNonNegativeNumber(nationwideAverageKm);

  return toFixed3((total + SHRINKAGE_PRIOR_MEMBERS * prior) / (members + SHRINKAGE_PRIOR_MEMBERS));
}

// 은하/은하군 크기 — 전국 평균 대비 배율(절대 기준). 전국 평균이 없으면(데이터 0) 전부 1.0.
export function galaxyScale({ totalDistanceKm, memberCount, nationwideAverageKm }) {
  const prior = toNonNegativeNumber(nationwideAverageKm);

  if (prior <= 0) {
    return 1;
  }

  const adjusted = shrunkAverageDistanceKm({ totalDistanceKm, memberCount, nationwideAverageKm: prior });

  return toFixed3(clamp(adjusted / prior, MIN_GALAXY_SCALE, MAX_GALAXY_SCALE));
}

// 로그 밝기 — 은하 총거리와 행성 이번 달 거리에 같은 함수를 쓴다. 화면 안 최댓값이 1.0.
// 한 명이 200km를 뛰어도 20km 뛴 사람이 까맣게 죽지 않는 게 로그를 쓰는 이유다.
export function logBrightness({ valueKm, maxValueKm }) {
  const value = toNonNegativeNumber(valueKm);
  const max = toNonNegativeNumber(maxValueKm);

  if (value <= 0 || max <= 0) {
    return IDLE_BRIGHTNESS;
  }

  const ratio = clamp(Math.log1p(value) / Math.log1p(max), 0, 1);

  return toFixed3(ACTIVE_BRIGHTNESS_FLOOR + (1 - ACTIVE_BRIGHTNESS_FLOOR) * ratio);
}

// 행성 크기 — 평생 누적 총거리의 **선형 비율** (오너 2026-08-19: "크기도 누적 거리로
// 비율로 해서 크기 잡아줘"). 은하의 누적 1등(=항성)이 1.0이고 나머지는 달린 만큼의
// 비율 그대로 작아진다 — 두 배 달렸으면 두 배 커 보인다. 로그로 누르던 시절에는 10km와
// 3,000km의 차이가 3.3배로 뭉개져 '많이 달린 사람이 크다'가 눈에 안 읽혔다.
// 바닥(MIN_PLANET_SCALE)은 남긴다 — 오늘 가입한 사람도 점으로는 보여야 탭할 수 있다.
export function planetScale({ lifetimeDistanceKm, maxLifetimeDistanceKm }) {
  const value = toNonNegativeNumber(lifetimeDistanceKm);
  const max = toNonNegativeNumber(maxLifetimeDistanceKm);

  if (value <= 0 || max <= 0) {
    return MIN_PLANET_SCALE;
  }

  const ratio = clamp(value / max, 0, 1);

  return toFixed3(MIN_PLANET_SCALE + (1 - MIN_PLANET_SCALE) * ratio);
}
