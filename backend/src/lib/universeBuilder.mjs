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
  buildLatestRegionChampions,
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

// 한 은하에 개별 렌더할 행성 수 상한. 넘는 인원은 성운 한 덩어리로 접는다 — 회원이 늘어도
// 화면이 무너지지 않게 하는 유일한 방어선이다. 항성·원시성·나는 상한과 무관하게 항상 뜬다.
export const PLANET_RENDER_CAP = 60;

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

// 이번 달 1등 = 원시성. 동률은 전원(깜빡이는 별이 여럿). 0km 우승은 없다 — 아무도 안 뛴
// 동네에 원시성이 켜지면 '가만히 있어도 1등'이 되어 봉인 규칙(거리 0은 우승 없음)과 어긋난다.
export function pickProtostars(members) {
  const best = members.reduce(
    (max, member) => Math.max(max, Number(member.monthDistanceKm) || 0),
    0,
  );

  if (best <= 0) {
    return [];
  }

  return members.filter((member) => (Number(member.monthDistanceKm) || 0) === best);
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
  latestChampions,
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

  const sealed = latestChampions.get(regionKey) ?? null;
  const sealedUserIds = new Set((sealed?.champions ?? []).map((champion) => champion.userId));
  const protostarUserIds = new Set(pickProtostars(members).map((member) => member.userId));

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
    isStar: sealedUserIds.has(member.userId),
    isProtostar: protostarUserIds.has(member.userId),
    isMine: member.userId === currentUserId,
  }));

  // 항성·원시성·나는 크기와 무관하게 반드시 화면에 있어야 한다 (이번 달 1등이 신입일 수
  // 있다 — 평생 거리로만 자르면 그 달의 주인공이 성운에 묻힌다).
  const pinned = bodies.filter((body) => body.isStar || body.isProtostar || body.isMine);
  const pinnedIds = new Set(pinned.map((body) => body.userId));
  const rest = bodies
    .filter((body) => !pinnedIds.has(body.userId))
    .sort((left, right) => right.lifetimeDistanceKm - left.lifetimeDistanceKm);

  const planets = [...pinned, ...rest.slice(0, Math.max(0, PLANET_RENDER_CAP - pinned.length))];
  const folded = rest.slice(Math.max(0, PLANET_RENDER_CAP - pinned.length));

  return {
    star: sealed
      ? {
        monthKey: sealed.monthKey,
        champions: sealed.champions.map((champion) => ({
          userId: champion.userId,
          userName: champion.userName,
          distanceKm: champion.distanceKm,
        })),
      }
      : null,
    planets: planets.sort((left, right) => right.lifetimeDistanceKm - left.lifetimeDistanceKm),
    nebula: folded.length > 0
      ? {
        memberCount: folded.length,
        totalLifetimeDistanceKm: Number(
          folded.reduce((sum, body) => sum + body.lifetimeDistanceKm, 0).toFixed(1),
        ),
      }
      : null,
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
  const latestChampions = buildLatestRegionChampions(store);

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
          latestChampions,
          currentUserId,
        })
        : { star: null, planets: [], nebula: null },
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
