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
