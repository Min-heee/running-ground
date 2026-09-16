import type { WeeklySummary } from '@/domain';

export const weeklySummary: WeeklySummary = {
  totalDistanceKm: 42.4,
  totalRuns: 8,
  goalAchievementRate: 84,
  weeklyGoalKm: 50,
  streakDays: 3,
  weeklyStreakWeeks: 3,
  bestWeeklyStreakWeeks: 5,
  weeklyStreakRanThisWeek: true,
  weeklyStreakMinWeekDistanceKm: 3,
  latestRun: {
    distanceKm: 8.2,
    source: 'Apple Health',
  },
  friendName: '김관우',
  friendGapKm: 3.4,
  districtName: '강남구',
  districtRank: 7,
  districtPoints: 98,
  districtBattle: {
    myDistrict: '강남구',
    averageDistancePerMember: 24.7,
    totalDistanceKm: 2480,
    participationRate: 62,
    districtRank: 3,
  },
};
