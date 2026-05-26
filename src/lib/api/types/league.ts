import type {
  DistrictPersonalRank,
  RankLeaderboard,
  RegionDrilldownNode,
  TodayRankingResponse,
  UniversityLeagueRank,
} from '@/domain';

export type DistrictPersonalResponse = {
  districtName: string;
  myRank: DistrictPersonalRank | null;
  myPoints: number;
  weeklyDistanceKm: number;
  focusRanks: DistrictPersonalRank[];
  ranks: DistrictPersonalRank[];
};

export type RegionBreadcrumbItem = Pick<RegionDrilldownNode, 'id' | 'name' | 'level'>;

export type RegionLeagueResponse = {
  currentNode: RegionDrilldownNode;
  breadcrumb: RegionBreadcrumbItem[];
  children: RegionDrilldownNode[];
};

export type UniversityLeagueResponse = {
  ranks: UniversityLeagueRank[];
};

export type {
  RankLeaderboard,
  TodayRankingResponse,
};
