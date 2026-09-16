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
  // 달성률의 기준 거리(km). 옵셔널: 구백엔드 응답엔 없고, 그때 카드는 50으로 적는다.
  weeklyGoalKm?: number;
  previousWeekDistanceKm?: number;
  streakDays: number;
  // 주 연속 러닝 뱃지 (오너 2026-09-01) — 서버 파생 표시값. 옵셔널: 구백엔드/캐시
  // 응답엔 없을 수 있고, 그때 뱃지는 그냥 숨는다.
  weeklyStreakWeeks?: number;
  bestWeeklyStreakWeeks?: number;
  weeklyStreakRanThisWeek?: boolean;
  // 주 합계 자격 문턱(km) — 서버가 내려보내 안내 문구와 판정이 어긋나지 않게.
  weeklyStreakMinWeekDistanceKm?: number;
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
  // 레이스 이벤트 완주 보상(815런): 저장 길목에서 서버가 박제 — points가 파생 합산 (오너 확정: 배지 없음, 포인트만).
  raceEvent?: {
    eventId: string;
    title: string;
    bonusPoints: number;
  };
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
