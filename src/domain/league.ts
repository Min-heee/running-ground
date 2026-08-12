export type RegionDrilldownNode = {
  id: string;
  name: string;
  level: 'country' | 'province' | 'city' | 'district';
  averageDistanceKm: number;
  totalDistanceKm: number;
  participationRate: number;
  participants: number;
  rank: number;
  // 월간 지역 랭킹 우승 별 (리프 지역만, 0이면 생략) — 축구 클럽 문양 별.
  stars?: number;
  children?: RegionDrilldownNode[];
};

export type DistrictPersonalRank = {
  id: string;
  rank: number;
  name: string;
  distanceKm: number;
  points: number;
  // Combined rank score (tier index * LP_PER_TIER + LP), used by the 랭크 점수 metric.
  rankScore: number;
  // Total distance run in the current calendar month (km), used by the 이번달 거리 metric.
  monthlyDistanceKm: number;
  // 지역 회원 랭킹 월간 우승 별 (0이면 생략).
  stars?: number;
  isMe?: boolean;
  isFriend?: boolean;
};

export type DistrictPersonalMetric = 'rankScore' | 'monthlyDistance';

export type TodayRankingCategory = 'pace' | 'distance' | 'streak';

export type TodayRankingEntry = {
  rank: number;
  userId: string;
  name: string;
  tag: string;
  value: string;
  valueNumber: number;
  isCurrentUser: boolean;
};

export type TodayRankingResponse = {
  category: TodayRankingCategory;
  rankedAt: string;
  entries: TodayRankingEntry[];
  totalCount: number;
};

export type RankLeaderboardUser = {
  id: string;
  name: string;
  lp: number;
  rankInTier: number;
};

export type RankLeaderboardTier = {
  tier: string;
  users: RankLeaderboardUser[];
};

export type RankLeaderboard = {
  tiers: RankLeaderboardTier[];
  currentUserId: string;
};
