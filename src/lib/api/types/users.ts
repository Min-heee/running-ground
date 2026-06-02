import type { RankState } from '@/domain';

export type OpponentMatchRecord = {
  total: number;
  duel: number;
  group: number;
};

export type OpponentMatchProfile = {
  id: string;
  name: string;
  publicTag: string;
  districtName: string;
  provinceName?: string;
  cityName?: string;
  rankState: RankState;
  lifetimeDistanceKm: number;
  matchRecord: OpponentMatchRecord;
};
