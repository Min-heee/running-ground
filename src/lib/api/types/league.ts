import type {
  DistrictPersonalRank,
  RegionDrilldownNode,
  UniversityLeagueRank,
} from '@/domain/types';

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
