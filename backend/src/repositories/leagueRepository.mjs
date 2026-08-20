import {
  buildTodayRanking,
  isTodayRankingCategory,
} from '../services/todayRankingBuilder.mjs';
import {
  buildRegionLiveStatsIndex,
  decorateRegionNodeWithLiveStats,
  regionAncestorsFromPath,
} from '../lib/regionLiveStats.mjs';
import { buildUserRunMetrics } from '../lib/points.mjs';
import {
  buildRankingStarCounts,
  hasUnsealedRankingStarMonth,
  resolveRegionNodeStarKey,
  sweepMonthlyRankingStars,
} from '../lib/monthlyRankingStars.mjs';
import { ensureUserRankState } from '../lib/userStoreHelpers.mjs';
import { LP_PER_TIER, RANK_TIERS } from '../lib/rankSystem.mjs';
import { buildUniverse } from '../lib/universeBuilder.mjs';
import { searchUniverse } from '../lib/universeSearch.mjs';

// The region drill is capped at three levels (country -> province -> city).
// Any node at the city level (시/군) is treated as a leaf, so its sub-regions
// (구/읍/면) never surface as children and the breadcrumb never goes deeper.
const REGION_LEAF_LEVELS = new Set(['city', 'district']);

function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRegionLeafLevel(level) {
  return REGION_LEAF_LEVELS.has(level);
}

function getUserRankScore(user) {
  const rankState = ensureUserRankState(user);
  const tierIndex = Math.max(0, RANK_TIERS.indexOf(rankState.tier));
  return tierIndex * LP_PER_TIER + rankState.lp;
}

function buildRunsByUserId(store, users) {
  const runsByUserId = new Map(users.map((user) => [user.id, []]));

  for (const run of store.runs ?? []) {
    if (runsByUserId.has(run.userId)) {
      runsByUserId.set(run.userId, [...(runsByUserId.get(run.userId) ?? []), run]);
    }
  }

  return runsByUserId;
}

function buildUserRegionKey(user) {
  return [
    normalizeOptionalString(user.provinceName),
    normalizeOptionalString(user.cityName),
    normalizeOptionalString(user.districtName),
  ].filter(Boolean).join(' > ');
}

// Region key that stops at the city level. Everyone in the same 시/군 rolls up
// together regardless of their stored 구/동, so a city leaf node aggregates all
// of its district members.
function buildUserCityRegionKey(user) {
  return [
    normalizeOptionalString(user.provinceName),
    normalizeOptionalString(user.cityName),
  ].filter(Boolean).join(' > ');
}

function buildDistrictRank(store, user, rank, currentUserId, getUserMetrics, memberStars) {
  const metrics = getUserMetrics(store, user.id);
  const stars = memberStars?.get(user.id) ?? 0;

  return {
    id: user.id,
    rank,
    name: user.name,
    // 월간 랭킹 우승 별 (monthlyRankingStars 원장 파생) — 0이면 필드 생략.
    ...(stars > 0 ? { stars } : {}),
    // 표시/정렬 거리 (오너 2026-07-31): 전체 러닝 — 가져온 기록 포함 (히어로 총거리와 동일 기준).
    distanceKm: metrics.currentWeekDistanceKm,
    points: metrics.currentWeekPoints,
    rankScore: getUserRankScore(user),
    monthlyDistanceKm: metrics.currentMonthDistanceKm,
    ...(user.id === currentUserId ? { isMe: true } : {}),
  };
}

function compareDistrictRank(store, left, right, getUserMetrics) {
  const leftMetrics = getUserMetrics(store, left.id);
  const rightMetrics = getUserMetrics(store, right.id);
  const leftDistanceKm = leftMetrics.currentWeekDistanceKm;
  const rightDistanceKm = rightMetrics.currentWeekDistanceKm;

  if (rightDistanceKm !== leftDistanceKm) {
    return rightDistanceKm - leftDistanceKm;
  }

  const leftPoints = leftMetrics.currentWeekPoints;
  const rightPoints = rightMetrics.currentWeekPoints;

  if (rightPoints !== leftPoints) {
    return rightPoints - leftPoints;
  }

  return left.name.localeCompare(right.name, 'ko');
}

function normalizeRegionChildren(children) {
  return [...children]
    .sort((left, right) => {
      if (right.averageDistanceKm !== left.averageDistanceKm) {
        return right.averageDistanceKm - left.averageDistanceKm;
      }

      if (right.totalDistanceKm !== left.totalDistanceKm) {
        return right.totalDistanceKm - left.totalDistanceKm;
      }

      if (right.participants !== left.participants) {
        return right.participants - left.participants;
      }

      return left.name.localeCompare(right.name, 'ko');
    })
    .map((child, index) => ({
      ...child,
      rank: index + 1,
    }));
}

function findRegionPath(node, targetId) {
  if (node.id === targetId) {
    return [node];
  }

  for (const child of node.children ?? []) {
    const childPath = findRegionPath(child, targetId);

    if (childPath) {
      return [node, ...childPath];
    }
  }

  return null;
}

// Resolve which region a district-personal listing should target. When a nodeId
// is provided we drill to that node in the region tree and aggregate everyone in
// the same 시/군 (city-level rollup). Without a nodeId we fall back to the
// requesting user's own region.
function resolveDistrictPersonalRegion(store, user, nodeId) {
  if (nodeId) {
    const path = findRegionPath(store.regionTree, nodeId);
    const targetNode = path?.[path.length - 1] ?? null;

    if (targetNode) {
      const provinceNode = path.find((entry) => entry.level === 'province') ?? null;
      const cityNode = path.find((entry) => entry.level === 'city') ?? null;
      const provinceName = normalizeOptionalString(provinceNode?.name);
      const cityName = normalizeOptionalString(cityNode?.name);

      // A city node (or anything under it) aggregates by 시/군: match province +
      // city and ignore the stored 구/동.
      if (cityName) {
        const regionKey = [provinceName, cityName].filter(Boolean).join(' > ');

        return {
          regionName: cityNode.name,
          matchesUser: (entry) => buildUserCityRegionKey(entry) === regionKey,
        };
      }

      // 광역시 trees have no city level — their 구 nodes sit directly under the
      // province. Match province + district: the same 구 name repeats across
      // six metros (동구/중구/서구...), so the district name alone must never
      // be the key. Without this branch the lookup silently fell through to
      // the REQUESTER's own region, so every metro 구 showed the same board.
      if (targetNode.level === 'district') {
        const regionKey = [provinceName, normalizeOptionalString(targetNode.name)].filter(Boolean).join(' > ');

        return {
          regionName: targetNode.name,
          matchesUser: (entry) => buildUserRegionKey(entry) === regionKey,
        };
      }

      // A province-level node aggregates the whole province.
      if (targetNode.level === 'province') {
        return {
          regionName: targetNode.name,
          matchesUser: (entry) => normalizeOptionalString(entry.provinceName) === provinceName,
        };
      }
    }
  }

  const currentRegionKey = buildUserRegionKey(user);

  return {
    regionName: user.districtName,
    matchesUser: (entry) => buildUserRegionKey(entry) === currentRegionKey,
  };
}

function buildDistrictPersonal(store, user, getUserMetrics, nodeId) {
  const { regionName, matchesUser } = resolveDistrictPersonalRegion(store, user, nodeId);
  const { memberStars } = buildRankingStarCounts(store);
  const districtUsers = store.users
    .filter((entry) => matchesUser(entry))
    .sort((left, right) => compareDistrictRank(store, left, right, getUserMetrics))
    .map((entry, index) => buildDistrictRank(store, entry, index + 1, user.id, getUserMetrics, memberStars));

  const myRank = districtUsers.find((entry) => entry.id === user.id) ?? null;
  const myRankIndex = myRank ? districtUsers.findIndex((entry) => entry.id === user.id) : -1;
  const focusStart = Math.max(0, myRankIndex - 1);
  const focusRanks = myRankIndex >= 0 ? districtUsers.slice(focusStart, focusStart + 4) : districtUsers.slice(0, 4);
  const myMetrics = getUserMetrics(store, user.id);

  return {
    districtName: regionName,
    myRank,
    myPoints: myMetrics.currentWeekPoints,
    // 헤더의 '내 주간 거리'는 랭크된 거리와 같은 기준 — 전체 러닝(가져온 기록 포함).
    weeklyDistanceKm: myMetrics.currentWeekDistanceKm,
    focusRanks,
    ranks: districtUsers,
  };
}

// Cap the drill path at the city level. If a deeper node is targeted we trim the
// path back to its city ancestor so the breadcrumb never exceeds three levels.
function capRegionPathDepth(path) {
  const leafIndex = path.findIndex((node) => isRegionLeafLevel(node.level));

  if (leafIndex === -1) {
    return path;
  }

  return path.slice(0, leafIndex + 1);
}

function buildRegionLeague(store, nodeId, createError, getUserMetrics) {
  const rootNode = store.regionTree;
  const rawPath = nodeId ? findRegionPath(rootNode, nodeId) : [rootNode];

  if (!rawPath) {
    throw createError(404, '선택한 지역 정보를 찾을 수 없어요.');
  }

  // 트리에 저장된 시드 통계는 박제 값 — 유저 러닝(이번 주 경쟁 거리)에서 실시간 계산해
  // 덮어쓴다. 정렬/순위(rank)도 실시간 값 기준이 된다.
  const statsIndex = buildRegionLiveStatsIndex(store, getUserMetrics);
  // 월간 우승 별 — 리프 노드(시/군 롤업·광역시 구)에만 붙는다.
  const { regionStars } = buildRankingStarCounts(store);
  const withStars = (node, ancestors) => {
    const starKey = resolveRegionNodeStarKey(node, ancestors);
    const stars = starKey ? regionStars.get(starKey) ?? 0 : 0;
    const decorated = decorateRegionNodeWithLiveStats(node, ancestors, statsIndex);
    return stars > 0 ? { ...decorated, stars } : decorated;
  };
  const path = capRegionPathDepth(rawPath);
  const rawCurrentNode = path[path.length - 1];
  const parentNode = path[path.length - 2] ?? null;
  const siblingAncestors = regionAncestorsFromPath(path.slice(0, -1));
  const decoratedSiblings = (parentNode ? parentNode.children ?? [] : [rawCurrentNode])
    .map((node) => withStars(node, siblingAncestors));
  const normalizedSiblings = normalizeRegionChildren(decoratedSiblings);
  const currentNode = normalizedSiblings.find((child) => child.id === rawCurrentNode.id)
    ?? withStars(rawCurrentNode, siblingAncestors);
  const childAncestors = regionAncestorsFromPath(path);
  // City (시/군) nodes are leaves: never expose their 구/동 children so the drill
  // stops at three levels and the city's whole member ranking is shown instead.
  const children = isRegionLeafLevel(currentNode.level)
    ? []
    : normalizeRegionChildren(
        (rawCurrentNode.children ?? []).map((node) => withStars(node, childAncestors)),
      );

  return {
    currentNode,
    breadcrumb: path.map(({ id, name, level }) => ({ id, name, level })),
    children,
  };
}

function requireTodayRankingCategory(category, createError) {
  if (!isTodayRankingCategory(category)) {
    throw createError(400, '오늘의 랭킹 카테고리가 올바르지 않아요.');
  }

  return category;
}

export function createJsonLeagueRepository({
  loadStore,
  mutateStore,
  requireUserByToken,
  getUserMetrics,
  createError,
}) {
  // 지난달 봉인 스윕 — 랭킹 읽기 길목의 on-request 트리거. 봉인할 게 없으면(대부분의 요청)
  // loadStore 사전 점검만으로 끝나 mutate 락을 잡지 않는다. 스윕 자체는 멱등.
  const sweepRankingStarsIfDue = async () => {
    if (typeof mutateStore !== 'function') {
      return;
    }

    const store = await loadStore();

    if (!hasUnsealedRankingStarMonth(store, new Date())) {
      return;
    }

    await mutateStore((mutableStore) => {
      sweepMonthlyRankingStars(mutableStore, new Date());
    });
  };

  return {
    async getDistrictPersonal({ token, nodeId }) {
      await sweepRankingStarsIfDue();
      const store = await loadStore();
      const user = requireUserByToken(store, token);
      return buildDistrictPersonal(store, user, getUserMetrics, nodeId);
    },

    async getRegions({ token, nodeId }) {
      await sweepRankingStarsIfDue();
      const store = await loadStore();
      requireUserByToken(store, token);
      return buildRegionLeague(store, nodeId, createError, getUserMetrics);
    },

    // 우주 탭 — 지역 보드와 같은 원장/집계를 천체로 번역해서 내려준다. 별 봉인 스윕을 같이
    // 태우는 이유는 랭킹 읽기 경로와 동일: 우주로만 들어온 유저도 봉인을 늦추면 안 된다.
    async getUniverse({ token, nodeId }) {
      await sweepRankingStarsIfDue();
      const store = await loadStore();
      const user = requireUserByToken(store, token);

      return buildUniverse({
        store,
        currentUserId: user.id,
        nodeId,
        getUserMetrics,
        createError,
      });
    },

    // 로그인 없이 보는 우주 (오너 2026-08-16: 사이트는 공개, 자기 별을 가지려면 로그인).
    //
    // 토큰을 받지 않는 유일한 읽기 경로다. 내려보내는 건 우주 화면이 그리는 것과 정확히
    // 같고(지역 통계 + 은하 안의 러너 이름·거리), 다른 점은 '내 별' 정보가 없다는 것뿐이다 —
    // 로그인한 사람만 자기 별을 안다.
    //
    // 주의: 이 경로가 열리는 순간 회원 이름과 이번 달 거리가 **공개 인터넷에 노출**된다.
    // 앱 안에서는 로그인한 회원끼리만 보이던 정보다. 개별 비공개(옵트아웃)는 아직 없다.
    async getPublicUniverse({ nodeId }) {
      await sweepRankingStarsIfDue();
      const store = await loadStore();

      return buildUniverse({
        store,
        // 주인이 없는 시점 — isMine은 어디에도 붙지 않고 me.galaxyNodeId는 비어 나간다.
        currentUserId: null,
        nodeId,
        getUserMetrics,
        createError,
      });
    },

    async searchPublicUniverse({ query }) {
      const store = await loadStore();

      return searchUniverse({
        store,
        query,
        currentUserId: null,
        getUserMetrics,
      });
    },

    // 이름으로 러너 찾기 — 목적지 은하만 돌려준다. 봉인 스윕을 태우지 않는 이유: 검색은
    // 타자 한 글자마다 들어오는 경로라 매번 스윕을 돌리면 저장소 쓰기가 폭주한다. 항성
    // 표시는 여기서 안 쓰므로 늦은 봉인이 결과를 틀리게 만들지도 않는다.
    async searchUniverse({ token, query }) {
      const store = await loadStore();
      const user = requireUserByToken(store, token);

      return searchUniverse({
        store,
        query,
        currentUserId: user.id,
        getUserMetrics,
      });
    },

    async getTodayRankings({ token, category }) {
      const store = await loadStore();
      const user = requireUserByToken(store, token);
      const safeCategory = requireTodayRankingCategory(category, createError);
      const users = store.users ?? [];
      const runsByUserId = buildRunsByUserId(store, users);

      return buildTodayRanking({
        category: safeCategory,
        currentUserId: user.id,
        buildUserMetrics: buildUserRunMetrics,
        runsByUserId,
        users,
      });
    },
  };
}
