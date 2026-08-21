// 우주 탭 페이로드 — 지역 트리를 그대로 천체 계층으로 읽는다 (오너 2026-08-15).
//
//   은하단(cluster) = 대한민국        · country 노드
//   은하군(group)   = 서울특별시/경기도 · province 노드
//   은하(galaxy)    = 송파구/고양시     · city·district 리프 노드
//   행성(planet)    = 개인             · 은하를 열어야 보인다 (오너: "은하 안에 들어가야 보임")
//
// 새로 집계하는 게 없다 — 리그 보드가 쓰는 regionLiveStats(이번 달 전체 거리, 임포트 포함)와
// 월간 우승 원장(monthlyRankingAwards)을 그대로 읽어 크기·밝기로만 번역한다. 우주가 자체
// 집계를 갖는 순간 같은 동네가 리그 탭과 우주 탭에서 다른 숫자로 보이게 된다.
//
// 화면에 찍히는 숫자(averageDistanceKm 등)는 리그와 똑같은 원값을 내려보내고, 수축 보정은
// 오직 그리는 크기(scale)에만 쓴다 — 보정된 값을 숫자로 보여주면 리그 순위와 어긋난다.

import {
  buildRankingStarCounts,
  resolveRegionNodeStarKey,
  resolveUserLeafRegion,
} from './monthlyRankingStars.mjs';
import { buildRegionLiveStatsIndex, regionAncestorsFromPath } from './regionLiveStats.mjs';
import { findRegionPath, findRegionPathForUser } from './regionTreeHelpers.mjs';
import {
  galaxyScale,
  logBrightness,
  nationwideAverageDistanceKm,
  planetScale,
} from './universeBodies.mjs';

const REGION_LEAF_LEVELS = new Set(['city', 'district']);

function isRegionLeafLevel(level) {
  return REGION_LEAF_LEVELS.has(level);
}

function universeLevelFor(regionLevel) {
  if (isRegionLeafLevel(regionLevel)) {
    return 'galaxy';
  }

  return regionLevel === 'province' ? 'group' : 'cluster';
}

// 드릴 깊이는 리그와 같은 3단에서 멈춘다 (리프 아래 구/동은 우주에도 없다).
function capRegionPathDepth(path) {
  const leafIndex = path.findIndex((node) => isRegionLeafLevel(node.level));

  return leafIndex === -1 ? path : path.slice(0, leafIndex + 1);
}

// 항성 = 그 은하의 **누적(평생) 거리 1등**, 은하마다 정확히 하나 (오너 2026-08-19:
// "이번 달 1등이 항성이 되는 게 아니라 누적 거리로 1등이 항성이 되는 거야", "한 은하에서
// 항성은 하나여야지"). 가장 많이 달려 온 사람이 가장 무거운 천체가 되어 점화한다 —
// 행성 크기도 평생 거리를 따르므로 태양은 자연히 그 은하에서 가장 큰 몸이다.
//
// 월간 순위 개념(원시성·봉인 우승 항성)은 이 사이트에 없다. 월간 우승 원장은 ★ 배지
// 개수로만 남는다. 동률은 id로 갈라 렌더마다 태양이 바뀌지 않게 한다. 아무도 안 뛴
// 은하(전원 0km)에는 태양이 없다.
export function pickStarUserId(members) {
  let star = null;

  for (const member of members) {
    const distance = Number(member.lifetimeDistanceKm) || 0;

    if (distance <= 0) {
      continue;
    }

    if (
      !star
      || distance > star.distance
      || (distance === star.distance && member.userId < star.userId)
    ) {
      star = { userId: member.userId, distance };
    }
  }

  return star?.userId ?? null;
}

function buildChildBodies(children, ancestors, { statsIndex, regionStars, nationwideAverageKm, myNodeIds }) {
  const measured = children.map((node) => {
    const stats = statsIndex.statsForNode(node, ancestors);
    const starKey = resolveRegionNodeStarKey(node, ancestors);

    return {
      node,
      stats,
      stars: starKey ? regionStars.get(starKey) ?? 0 : 0,
    };
  });

  // 밝기는 '이 화면 안의 최댓값' 기준 — 어느 층을 열어도 골고루 보이게 한다.
  const maxTotalDistanceKm = measured.reduce(
    (max, entry) => Math.max(max, entry.stats.totalDistanceKm),
    0,
  );

  return measured.map(({ node, stats, stars }) => ({
    id: node.id,
    name: node.name,
    level: universeLevelFor(node.level),
    memberCount: stats.memberCount,
    totalDistanceKm: stats.totalDistanceKm,
    averageDistanceKm: stats.averageDistanceKm,
    participationRate: stats.participationRate,
    scale: galaxyScale({
      totalDistanceKm: stats.totalDistanceKm,
      memberCount: stats.memberCount,
      nationwideAverageKm,
    }),
    brightness: logBrightness({ valueKm: stats.totalDistanceKm, maxValueKm: maxTotalDistanceKm }),
    stars,
    isMine: myNodeIds.has(node.id),
  }));
}

function buildGalaxyContents(store, regionKey, {
  getUserMetrics,
  memberStars,
  currentUserId,
}) {
  const members = [];

  for (const user of store.users ?? []) {
    if (resolveUserLeafRegion(user)?.regionKey !== regionKey) {
      continue;
    }

    const metrics = getUserMetrics(store, user.id);

    members.push({
      userId: user.id,
      userName: user.name,
      lifetimeDistanceKm: metrics.lifetimeDistanceKm ?? 0,
      monthDistanceKm: metrics.currentMonthDistanceKm ?? 0,
      stars: memberStars.get(user.id) ?? 0,
    });
  }

  const starUserId = pickStarUserId(members);

  const maxLifetimeDistanceKm = members.reduce(
    (max, member) => Math.max(max, member.lifetimeDistanceKm),
    0,
  );
  const maxMonthDistanceKm = members.reduce(
    (max, member) => Math.max(max, member.monthDistanceKm),
    0,
  );

  const bodies = members.map((member) => ({
    ...member,
    scale: planetScale({
      lifetimeDistanceKm: member.lifetimeDistanceKm,
      maxLifetimeDistanceKm,
    }),
    brightness: logBrightness({
      valueKm: member.monthDistanceKm,
      maxValueKm: maxMonthDistanceKm,
    }),
    isStar: member.userId === starUserId,
    isMine: member.userId === currentUserId,
  }));

  return {
    // 회원은 **전원** 자기 행성으로 뜬다 — 인당 정확히 하나 (오너 2026-08-21: "인당 별은
    // 1개여야 해, 자기 별이야"). 예전엔 상한(60)을 넘는 인원을 성운 한 덩어리로 접었는데,
    // 클라이언트는 성운을 그리지도 않아서 접힌 사람은 화면에서 투명인간이 됐다. 프레임
    // 예산은 클라이언트가 자체 상한(UniverseScene MAX_BODIES)과 컬링으로 지킨다.
    planets: bodies.sort((left, right) => right.lifetimeDistanceKm - left.lifetimeDistanceKm),
    // 키는 남긴다 — 배포된 바이너리가 아는 페이로드 모양 그대로. 이제 항상 null이다.
    nebula: null,
  };
}

export function buildUniverse({ store, currentUserId, nodeId, getUserMetrics, createError }) {
  const rootNode = store.regionTree;
  const rawPath = nodeId ? findRegionPath(rootNode, nodeId) : [rootNode];

  if (!rawPath) {
    throw createError(404, '선택한 지역 정보를 찾을 수 없어요.');
  }

  const path = capRegionPathDepth(rawPath);
  const currentNode = path[path.length - 1];
  const selfAncestors = regionAncestorsFromPath(path.slice(0, -1));
  const childAncestors = regionAncestorsFromPath(path);

  const statsIndex = buildRegionLiveStatsIndex(store, getUserMetrics);
  const { regionStars, memberStars } = buildRankingStarCounts(store);

  const nationwideStats = statsIndex.statsForNode(rootNode, {});
  const nationwideAverageKm = nationwideAverageDistanceKm({
    totalDistanceKm: nationwideStats.totalDistanceKm,
    memberCount: nationwideStats.memberCount,
  });

  const currentUser = (store.users ?? []).find((user) => user.id === currentUserId) ?? null;
  const myPath = currentUser ? capRegionPathDepth(findRegionPathForUser(rootNode, currentUser)) : [];
  const myNodeIds = new Set(myPath.map((node) => node.id));
  const myGalaxyNode = myPath.length > 1 ? myPath[myPath.length - 1] : null;

  const currentStats = statsIndex.statsForNode(currentNode, selfAncestors);
  const currentStarKey = resolveRegionNodeStarKey(currentNode, selfAncestors);
  const level = universeLevelFor(currentNode.level);

  const payload = {
    level,
    node: {
      id: currentNode.id,
      name: currentNode.name,
      level,
      memberCount: currentStats.memberCount,
      totalDistanceKm: currentStats.totalDistanceKm,
      averageDistanceKm: currentStats.averageDistanceKm,
      participationRate: currentStats.participationRate,
      stars: currentStarKey ? regionStars.get(currentStarKey) ?? 0 : 0,
    },
    breadcrumb: path.map(({ id, name, level: regionLevel }) => ({
      id,
      name,
      level: universeLevelFor(regionLevel),
    })),
    nationwideAverageDistanceKm: nationwideAverageKm,
    me: {
      userId: currentUserId,
      // 어느 층에서든 '내 행성으로' 워프할 목적지 — 지역 미설정이면 없다.
      galaxyNodeId: myGalaxyNode?.id ?? null,
      galaxyName: myGalaxyNode?.name ?? null,
    },
  };

  if (level === 'galaxy') {
    return {
      ...payload,
      bodies: [],
      galaxy: currentStarKey
        ? buildGalaxyContents(store, currentStarKey, {
          getUserMetrics,
          memberStars,
          currentUserId,
        })
        : { planets: [], nebula: null },
    };
  }

  return {
    ...payload,
    bodies: buildChildBodies(currentNode.children ?? [], childAncestors, {
      statsIndex,
      regionStars,
      nationwideAverageKm,
      myNodeIds,
    }),
    galaxy: null,
  };
}
