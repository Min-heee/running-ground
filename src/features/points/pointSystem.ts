import type { MyRunRecord, WeeklySummary } from '@/domain';
import type { StreakCalendar, WeeklyPointOverview, WeeklyPointTrack } from '@/features/points/types/pointSystem';
import {
  buildPointTrack,
  getMinimumRunDistanceForStreak,
  toFixed1,
} from '@/features/points/utils/pointRewards';
import { buildStreakCalendar } from '@/features/points/utils/streakCalendar';

export type {
  StreakCalendar,
  StreakCalendarCell,
  WeeklyPointOverview,
  WeeklyPointTrack,
  WeeklyPointTrackId,
  WeeklyPointTrackScope,
} from '@/features/points/types/pointSystem';

type WeeklyPointStats = {
  normalizedLifetimeDistanceKm: number;
  distanceLevel: number;
  minimumRunDistanceKm: number;
  nextDistanceTargetKm: number;
  distanceLevelProgressPercent: number;
  distanceLevelRemainingKm: number;
  previousWeekDistanceKm: number;
  improvementDistanceKm: number;
  growthTargetDistanceKm: number;
};

function buildWeeklyPointStats(summary: WeeklySummary, lifetimeDistanceKm?: number): WeeklyPointStats {
  const normalizedLifetimeDistanceKm = toFixed1(Math.max(lifetimeDistanceKm ?? summary.totalDistanceKm, summary.totalDistanceKm));
  const distanceLevel = Math.floor(normalizedLifetimeDistanceKm / 10);
  const nextDistanceTargetKm = Math.max(10, (distanceLevel + 1) * 10);
  const distanceLevelProgressKm = normalizedLifetimeDistanceKm % 10;
  const previousWeekFallbackKm = Math.max(0, summary.totalDistanceKm - Math.max(4, summary.totalRuns * 1.4));
  const previousWeekDistanceKm = toFixed1(Math.max(0, summary.previousWeekDistanceKm ?? previousWeekFallbackKm));
  const improvementDistanceKm = toFixed1(Math.max(0, summary.totalDistanceKm - previousWeekDistanceKm));

  return {
    normalizedLifetimeDistanceKm,
    distanceLevel,
    minimumRunDistanceKm: getMinimumRunDistanceForStreak(distanceLevel),
    nextDistanceTargetKm,
    distanceLevelProgressPercent: Math.round((distanceLevelProgressKm / 10) * 100),
    distanceLevelRemainingKm: toFixed1(nextDistanceTargetKm - normalizedLifetimeDistanceKm),
    previousWeekDistanceKm,
    improvementDistanceKm,
    growthTargetDistanceKm: toFixed1(previousWeekDistanceKm + 0.1),
  };
}

function buildDistanceTrack(stats: WeeklyPointStats): WeeklyPointTrack {
  return {
    id: 'distance',
    label: '거리',
    scope: 'lifetime',
    currentValue: stats.normalizedLifetimeDistanceKm,
    targetValue: stats.nextDistanceTargetKm,
    unit: 'km',
    rewardPoints: 10,
    progressPercent: Math.min(100, Math.max(0, stats.distanceLevelProgressPercent)),
    achieved: false,
    helperText: '누적 거리 10km마다 1레벨업하고 포인트를 받아요.',
    statusText: `다음 레벨까지 ${stats.distanceLevelRemainingKm}km`,
    badgeText: `Lv.${stats.distanceLevel}`,
  };
}

function buildStreakTrack(stats: WeeklyPointStats, streakCalendar: StreakCalendar): WeeklyPointTrack {
  return buildPointTrack({
    id: 'streak',
    label: '연속 러닝',
    scope: 'weekly',
    currentValue: streakCalendar.currentStreakDays,
    targetValue: Math.max(2, streakCalendar.currentStreakDays + 1),
    unit: '일',
    rewardPoints: streakCalendar.nextRewardPoints,
    helperText: `레벨 ${stats.distanceLevel} 기준 ${stats.minimumRunDistanceKm}km 이상 뛰어야 연속으로 인정돼요.`,
    statusText: streakCalendar.currentStreakDays >= 1
      ? `오늘 ${stats.minimumRunDistanceKm}km 이상 이어가면 +${streakCalendar.nextRewardPoints}P`
      : `다시 1일차부터 시작 · ${stats.minimumRunDistanceKm}km 이상부터 인정`,
    calendar: streakCalendar,
  });
}

function buildGrowthTrack(summary: WeeklySummary, stats: WeeklyPointStats): WeeklyPointTrack {
  return buildPointTrack({
    id: 'growth',
    label: '저번주 대비',
    scope: 'weekly',
    currentValue: summary.totalDistanceKm,
    targetValue: stats.growthTargetDistanceKm,
    unit: 'km',
    rewardPoints: 10,
    helperText: '저번주 총거리보다 더 많이 뛰면 성장 포인트를 받아요.',
    statusText: stats.improvementDistanceKm > 0
      ? '저번주 대비 향상 달성 · +10P'
      : `${toFixed1(Math.max(0, stats.growthTargetDistanceKm - summary.totalDistanceKm))}km 더 뛰면 +10P`,
  });
}

function calculateWeeklyEarnedPoints(streakCalendar: StreakCalendar, tracks: WeeklyPointTrack[]) {
  return streakCalendar.monthlyEarnedPoints + tracks
    .filter((track) => track.id === 'growth' && track.achieved)
    .reduce((sum, track) => sum + track.rewardPoints, 0);
}

export function buildWeeklyPointOverview(
  summary: WeeklySummary,
  options?: {
    lifetimeDistanceKm?: number;
    runs?: MyRunRecord[];
    currentDate?: Date;
  },
): WeeklyPointOverview {
  const currentDate = options?.currentDate ?? new Date();
  const stats = buildWeeklyPointStats(summary, options?.lifetimeDistanceKm);
  const streakCalendar = buildStreakCalendar(options?.runs ?? [], currentDate, stats.minimumRunDistanceKm);
  const tracks = [
    buildDistanceTrack(stats),
    buildStreakTrack(stats, streakCalendar),
    buildGrowthTrack(summary, stats),
  ];

  return {
    totalPoints: calculateWeeklyEarnedPoints(streakCalendar, tracks),
    lifetimeDistanceKm: stats.normalizedLifetimeDistanceKm,
    distanceLevel: stats.distanceLevel,
    distanceLevelPoints: stats.distanceLevel * 10,
    previousWeekDistanceKm: stats.previousWeekDistanceKm,
    improvementDistanceKm: stats.improvementDistanceKm,
    tracks,
  };
}
