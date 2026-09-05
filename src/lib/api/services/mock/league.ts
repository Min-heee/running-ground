import {
  friendRanks,
  myProfile,
  regionDrilldownTree,
  weeklySummary,
} from '@/data/mock';
import type {
  DistrictPersonalRank,
  RankLeaderboard,
  RegionDrilldownNode,
  TodayRankingCategory,
} from '@/domain';
import { LP_PER_TIER, RANK_TIERS } from '@/features/rank/rankDisplay';
import { rankMockTodayEntries } from '@/features/league/utils/mockTodayRanking';
import { getCurrentUserProfile } from '@/lib/session';
import type { DistrictPersonalResponse, TodayRankingResponse } from '../../types';

export function normalizeRegionChildren(children: RegionDrilldownNode[]) {
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

export function findRegionPath(node: RegionDrilldownNode, targetId: string): RegionDrilldownNode[] | null {
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

export function findRegionByName(node: RegionDrilldownNode, targetName: string): RegionDrilldownNode | null {
  if (node.name === targetName) {
    return node;
  }

  for (const child of node.children ?? []) {
    const matchedChild = findRegionByName(child, targetName);

    if (matchedChild) {
      return matchedChild;
    }
  }

  return null;
}

// The region drill is capped at three levels (country -> province -> city), so
// city (시/군) nodes and anything deeper are treated as leaves. This mirrors the
// backend cap so mock mode behaves the same as production.
const REGION_LEAF_LEVELS = new Set<RegionDrilldownNode['level']>(['city', 'district']);

export function isRegionLeafLevel(level: RegionDrilldownNode['level']) {
  return REGION_LEAF_LEVELS.has(level);
}

export function capRegionPathDepth(path: RegionDrilldownNode[]) {
  const leafIndex = path.findIndex((node) => isRegionLeafLevel(node.level));

  if (leafIndex === -1) {
    return path;
  }

  return path.slice(0, leafIndex + 1);
}

export const mockRegionalRunnerNames = [
  '김관우', '박지훈', '최민준', '한예린', '정이안', '이서윤', '박도윤', '김서하', '윤지후', '장민재',
  '이도현', '오하린', '조유준', '강서아', '백시우', '문가온', '남지호', '전유나', '신민호', '임다온',
  '유시온', '배하준', '권채은', '서태윤', '노서준', '정하율', '차도현', '홍서진', '최연우', '김하민',
  '안채린', '오민재', '류예린', '송도윤', '이하율', '하서준', '주아린', '문지후', '고예준', '서가은',
];

export function buildMockDistrictPersonalResponse(nodeId?: string): DistrictPersonalResponse {
  const profile = getCurrentUserProfile() ?? myProfile;
  const friendNameSet = new Set(friendRanks.map((friend) => friend.name));
  const targetNode = nodeId
    ? findRegionPath(regionDrilldownTree, nodeId)?.at(-1) ?? findRegionByName(regionDrilldownTree, profile.districtName) ?? regionDrilldownTree
    : findRegionByName(regionDrilldownTree, profile.districtName) ?? regionDrilldownTree;
  const isMyRegion = targetNode.name === profile.districtName;
  const listSize = Math.min(Math.max(Math.round(targetNode.participants / 5), 18), 48);
  const myRankPosition = isMyRegion ? Math.min(Math.max(Math.round(listSize * 0.58), 6), listSize - 3) : -1;
  const topDistance = Math.max(targetNode.averageDistanceKm + 14, weeklySummary.totalDistanceKm + 8);
  const profileTier = profile.rankState?.tier;
  const profileTierIndex = profileTier
    ? Math.max(0, RANK_TIERS.indexOf(profileTier as (typeof RANK_TIERS)[number]))
    : 0;
  const profileLp = Number.isFinite(profile.rankState?.lp) ? Math.trunc(profile.rankState?.lp ?? 0) : 0;
  const myRankScore = profileTierIndex * LP_PER_TIER + profileLp;
  const topRankScore = Math.max(myRankScore + 240, RANK_TIERS.length * LP_PER_TIER - 80);
  const ranks: DistrictPersonalRank[] = [];
  let runnerCursor = 0;

  for (let index = 0; index < listSize; index += 1) {
    const rank = index + 1;

    if (index === myRankPosition) {
      ranks.push({
        id: `region-me-${targetNode.id}`,
        rank,
        name: profile.name,
        distanceKm: Number(weeklySummary.totalDistanceKm.toFixed(1)),
        points: weeklySummary.districtPoints,
        rankScore: myRankScore,
        monthlyDistanceKm: Number((weeklySummary.totalDistanceKm * 3.4).toFixed(1)),
        weeklyStreakWeeks: weeklySummary.weeklyStreakWeeks,
        isMe: true,
        isFriend: friendNameSet.has(profile.name),
      });
      continue;
    }

    const baseName = mockRegionalRunnerNames[runnerCursor % mockRegionalRunnerNames.length];
    runnerCursor += 1;
    const distanceKm = Number(Math.max(3.2, topDistance - index * 1.15 - (index % 3) * 0.25).toFixed(1));
    const points = Math.max(12, Math.round(distanceKm * 2.15 + (listSize - index) * 0.6));
    const rankScore = Math.max(0, Math.round(topRankScore - index * 18 - (index % 4) * 6));
    const monthlyDistanceKm = Number(Math.max(distanceKm, distanceKm * 3.2 + (index % 5) * 1.4).toFixed(1));

    ranks.push({
      id: `${targetNode.id}-runner-${rank}`,
      rank,
      name: `${baseName}${runnerCursor > mockRegionalRunnerNames.length ? ` ${Math.ceil(runnerCursor / mockRegionalRunnerNames.length)}` : ''}`,
      distanceKm,
      points,
      rankScore,
      monthlyDistanceKm,
      // 실서버는 별/주 연속을 조건부로 싣는다 — 목에도 드문드문 뿌려 행 장식을 개발에서 보이게.
      ...(index === 0 ? { stars: 1 } : {}),
      ...(index % 4 === 1 ? { weeklyStreakWeeks: 2 + (index % 5) } : {}),
      isFriend: friendNameSet.has(baseName),
    });
  }

  const myRank = ranks.find((runner) => runner.isMe) ?? null;
  const myRankIndex = myRank ? ranks.findIndex((runner) => runner.id === myRank.id) : -1;
  const focusStart = Math.max(0, myRankIndex - 1);
  const focusRanks = myRankIndex >= 0 ? ranks.slice(focusStart, focusStart + 4) : ranks.slice(0, 4);

  return {
    districtName: targetNode.name,
    myRank,
    myPoints: myRank?.points ?? 0,
    weeklyDistanceKm: myRank?.distanceKm ?? 0,
    focusRanks,
    ranks,
  };
}

export function buildMockTodayRankingResponse(category: TodayRankingCategory): TodayRankingResponse {
  const profile = getCurrentUserProfile() ?? myProfile;
  const entries = rankMockTodayEntries(category, profile.publicTag);

  return {
    category,
    rankedAt: new Date().toISOString(),
    entries,
    totalCount: entries.length,
  };
}

export function buildMockRankLeaderboardResponse(): RankLeaderboard {
  const profile = getCurrentUserProfile() ?? myProfile;
  const currentUserId = 'mock-current-user';
  const usersByTier = new Map(RANK_TIERS.map((tier) => [tier, [] as RankLeaderboard['tiers'][number]['users']]));

  RANK_TIERS.forEach((tier, tierIndex) => {
    const users = usersByTier.get(tier);

    if (!users) {
      return;
    }

    for (let index = 0; index < 5; index += 1) {
      users.push({
        id: `mock-rank-${tier}-${index + 1}`,
        name: `${tier} 러너 ${index + 1}`,
        lp: Math.max(0, 180 - index * 28 + tierIndex * 4),
        rankInTier: index + 1,
      });
    }
  });

  const profileTier = profile.rankState?.tier;
  const runnerTier: (typeof RANK_TIERS)[number] = (
    profileTier && RANK_TIERS.includes(profileTier as (typeof RANK_TIERS)[number])
  )
    ? profileTier as (typeof RANK_TIERS)[number]
    : '입문';
  const runnerLp = Number.isFinite(profile.rankState?.lp) ? Math.trunc(profile.rankState?.lp ?? 0) : 0;
  const currentTierUsers = usersByTier.get(runnerTier) ?? [];
  currentTierUsers.push({
    id: currentUserId,
    name: profile.name,
    lp: runnerLp,
    rankInTier: 0,
  });
  currentTierUsers
    .sort((left, right) => {
      if (right.lp !== left.lp) {
        return right.lp - left.lp;
      }

      return left.name.localeCompare(right.name, 'ko');
    })
    .forEach((user, index) => {
      user.rankInTier = index + 1;
    });

  return {
    tiers: [...RANK_TIERS].reverse().map((tier) => ({
      tier,
      users: usersByTier.get(tier) ?? [],
    })),
    currentUserId,
  };
}
