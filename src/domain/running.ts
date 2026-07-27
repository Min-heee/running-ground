import type { RunSourceType } from './integrations';
import type { RunMatchResult } from './match';

export type RunRoutePoint = {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  altitudeAccuracyM?: number | null;
  accuracyM?: number | null;
  timestamp: string;
};

export type WeeklySummary = {
  totalDistanceKm: number;
  totalRuns: number;
  goalAchievementRate: number;
  previousWeekDistanceKm?: number;
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

export type MyRunRecord = {
  id: string;
  date: string;
  distanceKm: number;
  pace: string;
  source: string;
  sourceType?: RunSourceType;
  durationSeconds?: number;
  cadenceSpm?: number | null;
  elevationGainM?: number | null;
  route?: RunRoutePoint[];
  startedAt?: string;
  endedAt?: string;
  matchResult?: RunMatchResult;
  // 경찰과 도둑런: 경기장 태그 + 정산 누적 (chase 러닝만).
  chase?: {
    arenaId: string;
    arenaName?: string;
    bonusPoints: number;
    events: {
      type: 'catch' | 'meet';
      role: 'catcher' | 'caught' | 'meet';
      otherUserId: string;
      otherName: string;
      atIso: string;
      points: number;
    }[];
  };
};
