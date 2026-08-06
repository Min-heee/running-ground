export type RankState = {
  tier: string;
  lp: number;
};

export type UserProfile = {
  // 서버 불변 userId — 구서버 응답엔 없을 수 있다 (저장 대기열 소유자 대조용).
  id?: string;
  name: string;
  provinceName?: string;
  cityName?: string;
  districtName: string;
  addressDetail?: string;
  publicTag: string;
  statusMessage?: string;
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
