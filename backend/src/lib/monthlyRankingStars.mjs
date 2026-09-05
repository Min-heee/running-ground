// 월간 랭킹 우승 별 (오너 2026-08-13: "축구 클럽 문양 위 별처럼").
//
// 지역 랭킹은 매달 리셋되어 우승의 흔적이 남지 않는다 — 그래서 달이 끝나면 그 달의 우승을
// 내구 원장(store.monthlyRankingAwards)에 봉인하고, 별 개수는 언제나 이 원장에서 파생한다
// (지급 함수/카운터 없음 — chase·raceEvent와 같은 파생 회계 철학: 이중 지급·드리프트 불가).
//
// 오너 확정 (2026-09-05 규칙 v2로 개정):
//  - 별의 주인 셋: ① 그 달 1등 '시·도'(최상위 16개 중), ② 각 시·도 안의 1등 리프 지역
//    (시/군 롤업 또는 광역시 구 — 시·도마다 하나씩: 전남광주→동구, 경기→고양시 식),
//    ③ 각 리프 지역의 개인 1위. (v1은 전국 단일 리프 우승이었다 — 스윕이 재봉인으로 승격.)
//  - 판정 기준은 '이번달 거리' — 화면(멤버 보드 monthlyDistanceKm·지역 보드 인당 평균)과
//    동일한 공식만 쓴다. 지역/시·도 = 인당 평균(전체 회원수로 나눔; 시·도 회원수는 화면
//    byProvince처럼 리프 미설정 유저도 포함), 개인 = 그 달 전체 거리(가져온 기록 포함).
//  - 동률은 공동 우승(전원 별). 거리 0은 우승 없음 — 0km인데 회원수가 많아 튜플 1등이어도
//    별을 주지 않는다(오너 명시).
//
// 봉인 트리거는 저장소 관례대로 on-request 스윕(별도 스케줄러 없음): 랭킹 읽기 경로가
// 부른다. 달 경계는 KST — run.date가 이미 KST 달력 날짜라 집계는 문자열 prefix로 충분하고,
// "지난달이 끝났는가"만 KST 시계로 판정한다.
//
// 이관 주의: ① postgres 정규화 리그 리포는 이 스윕/별 장식이 없다 — LEAGUE_READS 플래그를
// 켜기 전에 반드시 이식(켜면 봉인이 조용히 멈춘다). 멤버 행의 weeklyStreakWeeks(주 연속
// 필, leagueRepository buildDistrictRank)도 같은 이관 목록이다 — 별 원장과 무관한 메트릭
// 파생이라 이 파일만 보고 이식하면 빠뜨린다. ② 행정구역 통합 마이그레이션은 유저
// 지역명만 바꾸므로, 원장(regionKey 동결 문자열)도 함께 재작성해야 별이 증발하지 않는다.

import { roundDistanceKm } from './distancePrecision.mjs';
// 별 기산 달 (오너 2026-09-05: "별은 8월달 기준으로 해서 주는걸로, 그전거는 삭제").
// 출시 달(7월)은 테스트런이 섞여 있어 8월부터 정식 기산 — 이 값을 올리면 스윕이
// 그 전 달의 봉인 원장을 삭제한다(아래 purge, 멱등).
export const RANKING_STARS_FIRST_MONTH_KEY = '2026-08';

// 지역 별 규칙 버전 (오너 2026-09-05 개정 = 2): ① 최상위 시·도 중 그 달 1등 시·도 별
// ② 각 시·도 안의 1등 리프 지역 별(시·도마다 하나씩) ③ 0km면 회원수로 1등이어도 별 없음.
// v1(전국 단일 리프 우승)로 봉인된 달은 스윕이 같은 달을 새 규칙으로 재봉인한다.
export const RANKING_STARS_RULE_VERSION = 2;

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

// 지역 랭킹 화면의 노드 키 — 노드+조상으로 원장의 regionKey와 같은 키를 만든다 (별 표시용
// 매칭). 시·도 별(규칙 v2)은 키가 시·도명 단독이라 리프 키(`시도|이름`)와 충돌하지 않는다.
export function resolveRegionNodeStarKey(node, ancestors) {
  const provinceName = node.level === 'province'
    ? String(node.name ?? '').trim()
    : String(ancestors?.provinceName ?? '').trim();
  const nodeName = String(node.name ?? '').trim();

  if (!provinceName || !nodeName) {
    return null;
  }

  if (node.level === 'province') {
    return nodeName;
  }

  if (node.level === 'city') {
    return `${provinceName}|${nodeName}`;
  }

  if (node.level === 'district' && !String(ancestors?.cityName ?? '').trim()) {
    return `${provinceName}|${nodeName}`;
  }

  return null;
}

// distancePrecision 단일 근원 — regionLiveStats와 반드시 같은 반올림이어야 한다.
function toFixed1(value) {
  return roundDistanceKm(value);
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
  // 시·도 집계 — 화면(regionLiveStats byProvince)과 동일: 리프(시/군·구) 미설정이어도
  // provinceName만 있으면 회원수(분모)에 들어간다.
  const provinces = new Map();

  for (const user of store.users ?? []) {
    const createdAtMs = Date.parse(user.createdAt ?? '');

    if (Number.isFinite(createdAtMs) && createdAtMs > monthEndMs) {
      continue;
    }

    const distanceKm = distanceByUserId.get(user.id) ?? 0;
    const provinceName = typeof user.provinceName === 'string' ? user.provinceName.trim() : '';

    if (provinceName) {
      const provinceEntry = provinces.get(provinceName) ?? { memberCount: 0, totalKm: 0 };
      provinceEntry.memberCount += 1;
      provinceEntry.totalKm += distanceKm;
      provinces.set(provinceName, provinceEntry);
    }

    const leafRegion = resolveUserLeafRegion(user);

    if (!leafRegion) {
      continue;
    }

    const entry = regions.get(leafRegion.regionKey)
      ?? { regionName: leafRegion.regionName, provinceName, members: [], totalKm: 0 };
    entry.members.push({ userId: user.id, userName: user.name, distanceKm });
    entry.totalKm += distanceKm;
    regions.set(leafRegion.regionKey, entry);
  }

  const memberChampions = [];
  const regionRowsByProvince = new Map();

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
    const rows = regionRowsByProvince.get(entry.provinceName) ?? [];
    rows.push({
      regionKey,
      regionName: entry.regionName,
      provinceName: entry.provinceName,
      totalDistanceKm,
      memberCount: entry.members.length,
      averageDistanceKm: entry.members.length > 0 ? toFixed1(totalDistanceKm / entry.members.length) : 0,
    });
    regionRowsByProvince.set(entry.provinceName, rows);
  }

  // 지역 랭킹 화면과 같은 비교 튜플(인당 평균 → 총거리 → 회원수 → 이름) — 화면 1위가 곧 우승.
  const compareRegionRows = (left, right) => {
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
  };
  // 오너 규칙 ③: 0km면 회원수로 1등이어도 별 없음 — 동률(튜플 완전 일치)은 공동 우승.
  const pickChampions = (rows) => {
    const sorted = [...rows].sort(compareRegionRows);
    const top = sorted[0];

    return top && top.totalDistanceKm > 0
      ? sorted.filter((row) =>
        row.averageDistanceKm === top.averageDistanceKm
        && row.totalDistanceKm === top.totalDistanceKm
        && row.memberCount === top.memberCount)
      : [];
  };

  // 규칙 v2-②: 각 시·도 안의 1등 리프 지역 — 시·도마다 하나씩(동률 공동).
  const regionChampions = [];

  for (const rows of regionRowsByProvince.values()) {
    regionChampions.push(...pickChampions(rows));
  }

  // 규칙 v2-①: 최상위 시·도 중 그 달 1등 — regionKey는 시·도명 단독(리프 키와 무충돌).
  const provinceRows = [...provinces.entries()].map(([provinceName, entry]) => {
    const totalDistanceKm = toFixed1(entry.totalKm);

    return {
      regionKey: provinceName,
      regionName: provinceName,
      totalDistanceKm,
      memberCount: entry.memberCount,
      averageDistanceKm: entry.memberCount > 0 ? toFixed1(totalDistanceKm / entry.memberCount) : 0,
    };
  });
  const provinceChampions = pickChampions(provinceRows);

  return {
    monthKey,
    sealedAt: sealedAtIso,
    ruleVersion: RANKING_STARS_RULE_VERSION,
    provinceChampions,
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

// 기산 달 이전의 봉인 원장 — FIRST_MONTH_KEY를 올린 뒤 남은 옛 별(삭제 대상).
function hasStaleRankingStarAwards(store) {
  return (store.monthlyRankingAwards ?? []).some(
    (award) => typeof award?.monthKey === 'string' && award.monthKey < RANKING_STARS_FIRST_MONTH_KEY,
  );
}

// 옛 규칙(v1: 전국 단일 리프 우승)으로 봉인된 달 — 새 규칙으로 재봉인 대상.
function needsRuleUpgrade(award) {
  return typeof award?.monthKey === 'string'
    && award.monthKey >= RANKING_STARS_FIRST_MONTH_KEY
    && (award.ruleVersion ?? 1) < RANKING_STARS_RULE_VERSION;
}

export function hasUnsealedRankingStarMonth(store, now = new Date()) {
  // 옛 별 원장(기산 전 달)이나 옛 규칙 봉인이 남아 있으면 스윕이 처리해야 하므로
  // mutate 경로를 태운다.
  if (hasStaleRankingStarAwards(store) || (store.monthlyRankingAwards ?? []).some(needsRuleUpgrade)) {
    return true;
  }

  const sealedKeys = new Set((store.monthlyRankingAwards ?? []).map((award) => award.monthKey));
  return resolveSealableMonthKeys(now).some((monthKey) => !sealedKeys.has(monthKey));
}

// 봉인 스윕 — 완료된(KST 기준 지난) 달 중 미봉인분을 전부 봉인한다. 멱등: monthKey 유일성.
export function sweepMonthlyRankingStars(store, now = new Date()) {
  if (!Array.isArray(store.monthlyRankingAwards)) {
    store.monthlyRankingAwards = [];
  }

  // 기산 달 이전 원장 삭제 (오너 2026-09-05) — 별 개수 파생이 전부 이 원장에서 나오므로
  // 여기 한 곳만 지우면 표면 전체에서 사라진다. 한 번 지운 뒤엔 no-op.
  if (hasStaleRankingStarAwards(store)) {
    store.monthlyRankingAwards = store.monthlyRankingAwards.filter(
      (award) => !(typeof award?.monthKey === 'string' && award.monthKey < RANKING_STARS_FIRST_MONTH_KEY),
    );
  }

  // 옛 규칙 봉인 재작성 (규칙 v2, 오너 2026-09-05) — 같은 달의 지역/시·도 우승만 새 규칙
  // 으로 다시 파생해 제자리 교체한다. 개인 별(memberChampions)은 v1/v2 의미가 같으므로
  // 봉인본을 그대로 이식한다 — 재계산하면 봉인 후의 지역 이동·탈퇴가 이미 준 별을 옮기거나
  // 지운다(적대검증 2026-09-05: 봉인 불변성 위반). sealedAt도 원래 봉인 시각 보존. 지역
  // 우승 재파생의 현재-소속 드리프트는 봉인 시점과 같은 계열로 문서화 수용. 한 번 올린
  // 뒤엔 ruleVersion이 채워져 no-op.
  store.monthlyRankingAwards = store.monthlyRankingAwards.map((award) => (
    needsRuleUpgrade(award)
      ? {
        ...buildMonthlyAward(store, award.monthKey, award.sealedAt ?? now.toISOString()),
        memberChampions: award.memberChampions ?? [],
      }
      : award
  ));

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

// 우주 탭의 항성 — 지역마다 '가장 최근에 우승자가 나온 달'의 개인 우승자 (오너 2026-08-15).
//
// 지난달에 그 지역 전원이 쉬어 우승자가 없었다고 별이 꺼지지는 않는다: 다음 우승자가 나올
// 때까지 직전 주인이 자리를 지킨다. 우주에서 항성이 사라지면 그 동네 행성들이 공중에 뜨고,
// "한 달 쉬었다고 남의 별까지 없앤다"는 건 별을 준 취지와도 어긋난다.
// 공동 우승(동률)은 그대로 여럿 돌려준다 — 쌍성계가 된다.
export function buildLatestRegionChampions(store) {
  const latestByRegion = new Map();

  for (const award of store.monthlyRankingAwards ?? []) {
    if (typeof award?.monthKey !== 'string') {
      continue;
    }

    for (const champion of award.memberChampions ?? []) {
      if (!champion?.regionKey) {
        continue;
      }

      const current = latestByRegion.get(champion.regionKey);
      const entry = {
        userId: champion.userId,
        userName: champion.userName,
        distanceKm: champion.distanceKm,
      };

      // monthKey는 'YYYY-MM' 고정 폭이라 문자열 비교가 곧 시간 비교다.
      if (!current || current.monthKey < award.monthKey) {
        latestByRegion.set(champion.regionKey, {
          monthKey: award.monthKey,
          regionName: champion.regionName,
          champions: [entry],
        });
        continue;
      }

      if (current.monthKey === award.monthKey) {
        current.champions.push(entry);
      }
    }
  }

  return latestByRegion;
}

// 별 개수 파생 — 원장이 유일한 근원. regionStars 키는 시·도명 단독(시·도 별, 규칙 v2-①)
// 또는 `시도|리프`(시·도 안 1등 지역, 규칙 v2-②) — resolveRegionNodeStarKey와 같은 규약.
export function buildRankingStarCounts(store) {
  const regionStars = new Map();
  const memberStars = new Map();

  for (const award of store.monthlyRankingAwards ?? []) {
    for (const provinceChampion of award.provinceChampions ?? []) {
      regionStars.set(provinceChampion.regionKey, (regionStars.get(provinceChampion.regionKey) ?? 0) + 1);
    }

    for (const regionChampion of award.regionChampions ?? []) {
      regionStars.set(regionChampion.regionKey, (regionStars.get(regionChampion.regionKey) ?? 0) + 1);
    }

    for (const memberChampion of award.memberChampions ?? []) {
      memberStars.set(memberChampion.userId, (memberStars.get(memberChampion.userId) ?? 0) + 1);
    }
  }

  return { regionStars, memberStars };
}
