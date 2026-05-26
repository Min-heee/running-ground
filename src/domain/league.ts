export type RegionDrilldownNode = {
  id: string;
  name: string;
  level: 'country' | 'province' | 'city' | 'district';
  averageDistanceKm: number;
  totalDistanceKm: number;
  participationRate: number;
  participants: number;
  rank: number;
  children?: RegionDrilldownNode[];
};

export type DistrictPersonalRank = {
  id: string;
  rank: number;
  name: string;
  distanceKm: number;
  points: number;
  isMe?: boolean;
  isFriend?: boolean;
};

export type UniversityLeagueRank = {
  rank: number;
  universityName: string;
  totalDistanceKm: number;
  participants: number;
  averageDistanceKm: number;
};

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
