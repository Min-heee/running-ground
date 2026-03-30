export type RunSourceType =
  | 'apple_health'
  | 'health_connect'
  | 'garmin'
  | 'strava'
  | 'nrc'
  | 'manual';

export type WeeklySummary = {
  totalDistanceKm: number;
  totalRuns: number;
  goalAchievementRate: number;
  streakDays: number;
  latestRun: {
    distanceKm: number;
    source: string;
  };
  friendName: string;
  friendGapKm: number;
  districtName: string;
  districtRank: number;
  districtPoints: number;
  districtBattle: {
    myDistrict: string;
    averageDistancePerMember: number;
    totalDistanceKm: number;
    participationRate: number;
    districtRank: number;
  };
};

export type FriendRank = {
  id: string;
  rank: number;
  name: string;
  tag?: string;
  distanceKm: number;
  points: number;
};

export type ConnectedSource = {
  sourceType: RunSourceType;
  displayName: string;
  connected: boolean;
  connectionStatus: 'connected' | 'planned';
};

export type UserProfile = {
  name: string;
  districtName: string;
  publicTag: string;
};

export type DistrictBattleRank = {
  rank: number;
  districtName: string;
  averageDistanceKm: number;
  participationRate: number;
  participants: number;
};

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
