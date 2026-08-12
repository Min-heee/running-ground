// 월간 랭킹 우승 별 (오너 2026-08-13: "축구 클럽 문양 위 별처럼").
//
// 지역 랭킹은 매달 리셋되어 우승의 흔적이 남지 않는다 — 그래서 달이 끝나면 그 달의 우승을
// 내구 원장(store.monthlyRankingAwards)에 봉인하고, 별 개수는 언제나 이 원장에서 파생한다
// (지급 함수/카운터 없음 — chase·raceEvent와 같은 파생 회계 철학: 이중 지급·드리프트 불가).
//
// 오너 확정:
//  - 별의 주인은 둘 다: 그 달 1위 '지역'(리프: 시/군 롤업 또는 광역시 구) + 각 지역의 개인 1위.
//  - 판정 기준은 '이번달 거리' — 화면(멤버 보드 monthlyDistanceKm·지역 보드 인당 평균)과
//    동일한 공식만 쓴다. 지역 = 인당 평균(전체 회원수로 나눔, regionLiveStats와 동일 주석
//    이유), 개인 = 그 달 전체 거리(가져온 기록 포함 — points.mjs monthDistanceByKey와 동일).
//  - 동률은 공동 우승(전원 별). 거리 0은 우승 없음(유령 지역/유저 별 파밍 방지의 최소선).
//
// 봉인 트리거는 저장소 관례대로 on-request 스윕(별도 스케줄러 없음): 랭킹 읽기 경로가
// 부른다. 달 경계는 KST — run.date가 이미 KST 달력 날짜라 집계는 문자열 prefix로 충분하고,
// "지난달이 끝났는가"만 KST 시계로 판정한다.
//
// 이관 주의: ① postgres 정규화 리그 리포는 이 스윕/별 장식이 없다 — LEAGUE_READS 플래그를
// 켜기 전에 반드시 이식(켜면 봉인이 조용히 멈춘다). ② 행정구역 통합 마이그레이션은 유저
// 지역명만 바꾸므로, 원장(regionKey 동결 문자열)도 함께 재작성해야 별이 증발하지 않는다.

export const RANKING_STARS_FIRST_MONTH_KEY = '2026-07'; // 서비스 출시 달 — 그 전엔 데이터 없음.

// 봉인 유예 (적대 검증 2026-08-13): 자정 직후 봉인하면 대기열에 밤새 걸린 말일 러닝이 영구
// 제외된다 — 달이 끝나고 48시간 지나야 봉인한다 (별이 이틀 늦게 붙는 대가).
export const RANKING_STARS_SEAL_DELAY_MS = 48 * 60 * 60 * 1000;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function resolveKstMonthKey(now) {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 7);
}

function nextMonthKey(monthKey) {
  let [year, month] = monthKey.split('-').map(Number);
  month += 1;

  if (month > 12) {
    month = 1;
    year += 1;
  }

  return `${year}-${String(month).padStart(2, '0')}`;
}

// 그 달의 끝(KST) = 다음 달 1일 0시 KST의 UTC ms.
function resolveMonthEndMs(monthKey) {
  return Date.parse(`${nextMonthKey(monthKey)}-01T00:00:00+09:00`);
}

function listMonthKeysBefore(currentMonthKey, firstMonthKey) {
  const keys = [];
  let [year, month] = firstMonthKey.split('-').map(Number);

  while (true) {
    const key = `${year}-${String(month).padStart(2, '0')}`;

    if (key >= currentMonthKey) {
      return keys;
    }

    keys.push(key);
    month += 1;

    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
}

// regionLiveStats의 리프 키/이름 규칙 그대로: 시/군 롤업(`시도|시군`) 또는 광역시 직속
// 구(`시도|구`). 지역 미설정 유저는 소속 없음.
export function resolveUserLeafRegion(user) {
  const provinceName = typeof user.provinceName === 'string' ? user.provinceName.trim() : '';
  const cityName = typeof user.cityName === 'string' ? user.cityName.trim() : '';
  const districtName = typeof user.districtName === 'string' ? user.districtName.trim() : '';

  if (!provinceName) {
    return null;
  }

  if (cityName) {
    return { regionKey: `${provinceName}|${cityName}`, regionName: cityName };
  }

  if (districtName) {
    return { regionKey: `${provinceName}|${districtName}`, regionName: districtName };
  }

  return null;
}

// 지역 랭킹 화면의 리프 노드 키 — 노드+조상으로 같은 키를 만든다 (별 표시용 매칭).
export function resolveRegionNodeStarKey(node, ancestors) {
  const provinceName = node.level === 'province'
    ? String(node.name ?? '').trim()
    : String(ancestors?.provinceName ?? '').trim();
  const nodeName = String(node.name ?? '').trim();

  if (!provinceName || !nodeName) {
    return null;
  }

  if (node.level === 'city') {
    return `${provinceName}|${nodeName}`;
  }

  if (node.level === 'district' && !String(ancestors?.cityName ?? '').trim()) {
    return `${provinceName}|${nodeName}`;
  }

  return null;
}

function toFixed1(value) {
  return Number(value.toFixed(1));
}

// 과거 달을 '봉인 시점의 현재 상태'로 재구성할 때의 시간 오염 차단 (적대 검증 2026-08-13):
//  - 그 달이 끝난 뒤 가입한 유저는 그 달의 명부(분모)에 끼지 않는다 — 8월 가입자가 7월
//    지역 평균을 희석해 화면이 보여준 적 없는 우승을 만들던 구멍.
//  - 그 달이 끝나고 유예(48h) 후에 생성된 기록(늦은 헬스 임포트의 과거 날짜)은 세지 않는다.
//    유예 안의 생성(대기열 늦은 업로드)은 정당한 그 달의 러닝이라 센다.
//  - 지역 이동(가입 후 지역 변경)은 현재 소속 기준 — 과거 소속은 복원 불가, 문서화로 수용.
function buildMonthlyAward(store, monthKey, sealedAtIso) {
  const monthPrefix = `${monthKey}-`;
  const monthEndMs = resolveMonthEndMs(monthKey);
  const runCreatedCutoffMs = monthEndMs + RANKING_STARS_SEAL_DELAY_MS;
  const distanceByUserId = new Map();

  for (const run of store.runs ?? []) {
    if (typeof run.date !== 'string' || !run.date.startsWith(monthPrefix)) {
      continue;
    }

    const createdAtMs = Date.parse(run.createdAt ?? '');

    if (Number.isFinite(createdAtMs) && createdAtMs > runCreatedCutoffMs) {
      continue;
    }

    const distanceKm = Number(run.distanceKm) || 0;
    // 화면의 monthDistanceByKey(points.mjs)와 같은 누적식: 매 기록마다 러닝 합계를 1자리로
    // 반올림 — 합산 순서까지 같아야 동률 판정이 화면과 어긋나지 않는다.
    distanceByUserId.set(run.userId, toFixed1((distanceByUserId.get(run.userId) ?? 0) + distanceKm));
  }

  const regions = new Map();

  for (const user of store.users ?? []) {
    const createdAtMs = Date.parse(user.createdAt ?? '');

    if (Number.isFinite(createdAtMs) && createdAtMs > monthEndMs) {
      continue;
    }

    const leafRegion = resolveUserLeafRegion(user);

    if (!leafRegion) {
      continue;
    }

    const entry = regions.get(leafRegion.regionKey)
      ?? { regionName: leafRegion.regionName, members: [], totalKm: 0 };
    const distanceKm = distanceByUserId.get(user.id) ?? 0;
    entry.members.push({ userId: user.id, userName: user.name, distanceKm });
    entry.totalKm += distanceKm;
    regions.set(leafRegion.regionKey, entry);
  }

  const memberChampions = [];
  const regionRows = [];

  for (const [regionKey, entry] of regions) {
    const bestDistanceKm = Math.max(0, ...entry.members.map((member) => member.distanceKm));

    if (bestDistanceKm > 0) {
      for (const member of entry.members) {
        if (member.distanceKm === bestDistanceKm) {
          memberChampions.push({
            regionKey,
            regionName: entry.regionName,
            userId: member.userId,
            userName: member.userName,
            distanceKm: member.distanceKm,
          });
        }
      }
    }

    // 화면(regionLiveStats)과 같은 반올림 순서: 총거리를 먼저 1자리로 만든 뒤 나눈다.
    const totalDistanceKm = toFixed1(entry.totalKm);
    regionRows.push({
      regionKey,
      regionName: entry.regionName,
      totalDistanceKm,
      memberCount: entry.members.length,
      averageDistanceKm: entry.members.length > 0 ? toFixed1(totalDistanceKm / entry.members.length) : 0,
    });
  }

  // 지역 랭킹 화면과 같은 비교 튜플(인당 평균 → 총거리 → 회원수 → 이름) — 화면 1위가 곧 우승.
  regionRows.sort((left, right) => {
    if (right.averageDistanceKm !== left.averageDistanceKm) {
      return right.averageDistanceKm - left.averageDistanceKm;
    }

    if (right.totalDistanceKm !== left.totalDistanceKm) {
      return right.totalDistanceKm - left.totalDistanceKm;
    }

    if (right.memberCount !== left.memberCount) {
      return right.memberCount - left.memberCount;
    }

    return left.regionName.localeCompare(right.regionName, 'ko');
  });

  const topRegion = regionRows[0];
  const regionChampions = topRegion && topRegion.totalDistanceKm > 0
    ? regionRows.filter((row) =>
      row.averageDistanceKm === topRegion.averageDistanceKm
      && row.totalDistanceKm === topRegion.totalDistanceKm
      && row.memberCount === topRegion.memberCount)
    : [];

  return {
    monthKey,
    sealedAt: sealedAtIso,
    regionChampions,
    memberChampions,
  };
}

// 봉인 대상 달: 유예(48h)까지 지난 완료 달만 — (now - 유예)가 속한 KST 달 이전 전부.
function resolveSealableMonthKeys(now) {
  return listMonthKeysBefore(
    resolveKstMonthKey(new Date(now.getTime() - RANKING_STARS_SEAL_DELAY_MS)),
    RANKING_STARS_FIRST_MONTH_KEY,
  );
}

export function hasUnsealedRankingStarMonth(store, now = new Date()) {
  const sealedKeys = new Set((store.monthlyRankingAwards ?? []).map((award) => award.monthKey));
  return resolveSealableMonthKeys(now).some((monthKey) => !sealedKeys.has(monthKey));
}

// 봉인 스윕 — 완료된(KST 기준 지난) 달 중 미봉인분을 전부 봉인한다. 멱등: monthKey 유일성.
export function sweepMonthlyRankingStars(store, now = new Date()) {
  if (!Array.isArray(store.monthlyRankingAwards)) {
    store.monthlyRankingAwards = [];
  }

  const sealedKeys = new Set(store.monthlyRankingAwards.map((award) => award.monthKey));
  const created = [];

  for (const monthKey of resolveSealableMonthKeys(now)) {
    if (sealedKeys.has(monthKey)) {
      continue;
    }

    const award = buildMonthlyAward(store, monthKey, now.toISOString());
    store.monthlyRankingAwards.push(award);
    created.push(award);
  }

  return created;
}

// 별 개수 파생 — 원장이 유일한 근원.
export function buildRankingStarCounts(store) {
  const regionStars = new Map();
  const memberStars = new Map();

  for (const award of store.monthlyRankingAwards ?? []) {
    for (const regionChampion of award.regionChampions ?? []) {
      regionStars.set(regionChampion.regionKey, (regionStars.get(regionChampion.regionKey) ?? 0) + 1);
    }

    for (const memberChampion of award.memberChampions ?? []) {
      memberStars.set(memberChampion.userId, (memberStars.get(memberChampion.userId) ?? 0) + 1);
    }
  }

  return { regionStars, memberStars };
}
