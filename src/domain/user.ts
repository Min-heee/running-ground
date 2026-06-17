export type RankState = {
  tier: string;
  lp: number;
};

export type UserProfile = {
  name: string;
  provinceName?: string;
  cityName?: string;
  districtName: string;
  addressDetail?: string;
  publicTag: string;
  rankState?: RankState;
  lifetimeDistanceKm?: number;
};

export type AppNotice = {
  id: string;
  title: string;
  message: string;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
