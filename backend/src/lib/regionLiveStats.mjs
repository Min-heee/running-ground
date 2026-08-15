// 지역 노드 실시간 집계 — regionTree에 저장된 통계(averageDistanceKm/totalDistanceKm/
// participants/participationRate)는 시드 때 한 번 심어진 박제 값이라, 실제 유저가 아무리
// 뛰어도 지역 보드 총거리가 오르지 않았다 (오너 버그 리포트 2026-07-30). 이 모듈이 유저
// 러닝에서 매 요청 계산한 값으로 노드를 덮어쓴다.
//
// 집계 기준 (오너 2026-07-31): 이번 달(KST) 전체 거리 — 타앱에서 가져온 기록도 포함한다.
// 멤버 보드의 '이번달 거리' 칸이 쓰는 monthlyDistanceKm(currentMonthDistanceKm)와 같은
// 값이라, 히어로 총거리가 아래 목록의 합과 정확히 맞는다 (기존엔 히어로만 경쟁 거리라
// 3.1 vs 5.1처럼 어긋났다). 포인트/LP는 별개 정책으로 계속 경쟁 러닝 기준.
// participants 필드는 클라 라벨('회원수')에 맞춰 지역 소속 회원 수를 담는다.

import { roundDistanceKm } from './distancePrecision.mjs';
function normalizeName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// distancePrecision 단일 근원 — monthlyRankingStars와 반드시 같은 반올림이어야 한다.
function toFixed1(value) {
  return roundDistanceKm(value);
}

// 유저 1-pass로 지역 키별 {members, active, totalKm} 인덱스를 만든다.
// 키 종류: 시/도(p) · 시/군 롤업(p|c) · 광역시 구(p||d — city 없는 트리).
export function buildRegionLiveStatsIndex(store, getUserMetrics) {
  const nationwide = { members: 0, active: 0, totalKm: 0 };
  const byProvince = new Map();
  const byCity = new Map();
  const byMetroDistrict = new Map();

  const accumulate = (map, key, weeklyKm) => {
    if (!key) {
      return;
    }

    const entry = map.get(key) ?? { members: 0, active: 0, totalKm: 0 };
    entry.members += 1;

    if (weeklyKm > 0) {
      entry.active += 1;
      entry.totalKm += weeklyKm;
    }

    map.set(key, entry);
  };

  for (const user of store.users) {
    const provinceName = normalizeName(user.provinceName);

    if (!provinceName) {
      continue;
    }

    const cityName = normalizeName(user.cityName);
    const districtName = normalizeName(user.districtName);
    const monthKm = getUserMetrics(store, user.id).currentMonthDistanceKm;

    // 루트(대한민국) 카드는 전국 합계 — 지역 미설정 유저도 회원수엔 포함하지 않는다
    // (province 없는 유저는 위에서 이미 continue).
    nationwide.members += 1;

    if (monthKm > 0) {
      nationwide.active += 1;
      nationwide.totalKm += monthKm;
    }

    accumulate(byProvince, provinceName, monthKm);

    if (cityName) {
      accumulate(byCity, `${provinceName}|${cityName}`, monthKm);
    } else if (districtName) {
      accumulate(byMetroDistrict, `${provinceName}|${districtName}`, monthKm);
    }
  }

  // ancestors: 노드까지의 경로에서 뽑은 { provinceName, cityName } (루트/자기 자신 제외).
  const statsForNode = (node, ancestors) => {
    const provinceName = node.level === 'province' ? normalizeName(node.name) : normalizeName(ancestors.provinceName);
    let entry = null;

    if (node.level === 'country') {
      entry = nationwide;
    } else if (node.level === 'province') {
      entry = byProvince.get(provinceName) ?? null;
    } else if (node.level === 'city') {
      entry = byCity.get(`${provinceName}|${normalizeName(node.name)}`) ?? null;
    } else if (normalizeName(ancestors.cityName)) {
      // 시 아래 구/동 노드 — 보드는 시 단위 리프에서 멈추므로 노출되지 않지만, 호출되면 시 롤업.
      entry = byCity.get(`${provinceName}|${normalizeName(ancestors.cityName)}`) ?? null;
    } else {
      // 광역시 직속 구 (city 레벨 없는 트리).
      entry = byMetroDistrict.get(`${provinceName}|${normalizeName(node.name)}`) ?? null;
    }

    const members = entry?.members ?? 0;
    const active = entry?.active ?? 0;
    const totalKm = toFixed1(entry?.totalKm ?? 0);

    return {
      memberCount: members,
      // 클라 히어로/행 라벨이 '회원수'로 이 필드를 읽는다 — 지역 소속 인원.
      participants: members,
      totalDistanceKm: totalKm,
      // '인당 평균' — 회원수 기준 (활동자만으로 나누면 라벨과 어긋난다).
      averageDistanceKm: members > 0 ? toFixed1(totalKm / members) : 0,
      participationRate: members > 0 ? Math.round((active / members) * 100) : 0,
    };
  };

  return { statsForNode };
}

// 노드(스프레드 사본)에 실시간 통계를 덮어쓴다 — 응답 모양 보존을 위해 children 유지
// (중첩 노드의 통계는 클라가 읽지 않으므로 그대로 둔다).
export function decorateRegionNodeWithLiveStats(node, ancestors, statsIndex) {
  return {
    ...node,
    ...statsIndex.statsForNode(node, ancestors),
  };
}

// 경로에서 조상 이름(시/도, 시/군)을 뽑는다.
export function regionAncestorsFromPath(path) {
  return {
    provinceName: path.find((entry) => entry.level === 'province')?.name ?? '',
    cityName: path.find((entry) => entry.level === 'city')?.name ?? '',
  };
}
