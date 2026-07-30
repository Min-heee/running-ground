// 지역 노드 실시간 집계 — regionTree에 저장된 통계(averageDistanceKm/totalDistanceKm/
// participants/participationRate)는 시드 때 한 번 심어진 박제 값이라, 실제 유저가 아무리
// 뛰어도 지역 보드 총거리가 오르지 않았다 (오너 버그 리포트 2026-07-30). 이 모듈이 유저
// 러닝에서 매 요청 계산한 값으로 노드를 덮어쓴다.
//
// 집계 기준: 이번 주(KST) '경쟁' 거리 — 멤버 랭킹(compareDistrictRank)과 같은 숫자라
// 보드의 총거리와 멤버 목록이 항상 합이 맞는다. 임포트 기록은 지역 대항전에선 제외
// (헬스 앱 수기 입력으로 지역 순위를 미는 파밍 차단 — 홈 포인트 게이지와는 다른 정책).

function normalizeName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toFixed1(value) {
  return Number(value.toFixed(1));
}

// 유저 1-pass로 지역 키별 {members, active, totalKm} 인덱스를 만든다.
// 키 종류: 시/도(p) · 시/군 롤업(p|c) · 광역시 구(p||d — city 없는 트리).
export function buildRegionLiveStatsIndex(store, getUserMetrics) {
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
    const weeklyKm = getUserMetrics(store, user.id).competitiveWeekDistanceKm;

    accumulate(byProvince, provinceName, weeklyKm);

    if (cityName) {
      accumulate(byCity, `${provinceName}|${cityName}`, weeklyKm);
    } else if (districtName) {
      accumulate(byMetroDistrict, `${provinceName}|${districtName}`, weeklyKm);
    }
  }

  // ancestors: 노드까지의 경로에서 뽑은 { provinceName, cityName } (루트/자기 자신 제외).
  const statsForNode = (node, ancestors) => {
    const provinceName = node.level === 'province' ? normalizeName(node.name) : normalizeName(ancestors.provinceName);
    let entry = null;

    if (node.level === 'province') {
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
      participants: active,
      totalDistanceKm: totalKm,
      averageDistanceKm: active > 0 ? toFixed1(totalKm / active) : 0,
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
