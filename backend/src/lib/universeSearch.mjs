// 우주 검색 (오너 2026-08-15: "검색창에 아이디를 치면 그 행성·항성으로").
//
// 이름으로 러너를 찾아 '그 사람의 은하가 어디인지'를 돌려준다. 화면은 그 은하를 열고 해당
// 행성을 조준한다 — 즉 여기서 필요한 건 좌표가 아니라 목적지 노드다. 좌표는 화면 크기와
// 회원 수에 따라 매번 달라지므로 서버가 알 수 없고, 알 필요도 없다.
//
// 지역 미설정 러너는 결과에서 빠진다. 우주에서 행성을 가지려면 소속 은하가 있어야 하고
// (오너: "자기 별을 가질려면 로그인해서 기록 연동"), 목적지가 없는 검색 결과는 눌러도
// 아무 데도 갈 수 없어 고장으로 읽힌다.
//
// 새로 집계하지 않는다: 정렬에 쓰는 거리도 리그·우주가 쓰는 getUserMetrics 그대로다.

import { resolveUserLeafRegion } from './monthlyRankingStars.mjs';
import { findRegionPathForUser } from './regionTreeHelpers.mjs';

export const UNIVERSE_SEARCH_LIMIT = 12;
// 한 글자 검색은 사실상 전체 명부를 훑어 내려보내는 것과 같다 — 두 글자부터 받는다.
export const UNIVERSE_SEARCH_MIN_LENGTH = 2;

// 공백·대소문자 차이로 못 찾는 일이 없게 정규화한다. 한글은 대소문자가 없지만 닉네임에
// 영문이 섞이는 경우가 흔하다.
export function normalizeSearchText(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

// 일치 등급 — 정확 > 앞부분 > 포함. 낮을수록 위로 온다.
function matchRank(normalizedName, normalizedQuery) {
  if (normalizedName === normalizedQuery) {
    return 0;
  }

  if (normalizedName.startsWith(normalizedQuery)) {
    return 1;
  }

  return normalizedName.includes(normalizedQuery) ? 2 : -1;
}

export function searchUniverse({ store, query, currentUserId, getUserMetrics }) {
  const normalizedQuery = normalizeSearchText(query);

  if (normalizedQuery.length < UNIVERSE_SEARCH_MIN_LENGTH) {
    return { query: normalizedQuery, results: [] };
  }

  const rootNode = store.regionTree;
  const matches = [];

  for (const user of store.users ?? []) {
    const rank = matchRank(normalizeSearchText(user.name), normalizedQuery);

    if (rank < 0) {
      continue;
    }

    // 리프 지역(은하)이 없으면 갈 곳이 없다.
    if (!resolveUserLeafRegion(user)) {
      continue;
    }

    const path = findRegionPathForUser(rootNode, user);
    const galaxyNode = path.length > 1 ? path[path.length - 1] : null;

    if (!galaxyNode) {
      continue;
    }

    const metrics = getUserMetrics(store, user.id);

    matches.push({
      userId: user.id,
      userName: user.name,
      galaxyNodeId: galaxyNode.id,
      galaxyName: galaxyNode.name,
      // 어느 은하인지 한 줄로 읽히게 — 같은 이름의 동네가 여러 도에 있다(중구·남구…).
      regionPath: path.slice(1).map((node) => node.name).join(' · '),
      monthDistanceKm: metrics.currentMonthDistanceKm ?? 0,
      isMine: user.id === currentUserId,
      rank,
    });
  }

  matches.sort((left, right) => {
    if (left.rank !== right.rank) {
      return left.rank - right.rank;
    }

    if (right.monthDistanceKm !== left.monthDistanceKm) {
      return right.monthDistanceKm - left.monthDistanceKm;
    }

    return left.userName.localeCompare(right.userName, 'ko');
  });

  return {
    query: normalizedQuery,
    results: matches.slice(0, UNIVERSE_SEARCH_LIMIT).map(({ rank, ...result }) => result),
  };
}
