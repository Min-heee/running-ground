import type { RegionDrilldownNode, UserProfile } from '@/domain';

export type LeagueMode = 'region' | 'university';

export type LeagueRegionNodeIdentity = Pick<RegionDrilldownNode, 'level' | 'name'>;

export type LeagueProfileRegion = Pick<UserProfile, 'provinceName' | 'cityName' | 'districtName'>;

export type PodiumRank = 1 | 2 | 3;

export type PodiumTheme = {
  iconColor: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
};
