export type UserProfile = {
  name: string;
  provinceName?: string;
  cityName?: string;
  districtName: string;
  universityName?: string;
  addressDetail?: string;
  publicTag: string;
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
