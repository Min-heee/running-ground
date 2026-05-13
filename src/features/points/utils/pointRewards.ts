import type {
  StreakCalendar,
  WeeklyPointTrack,
  WeeklyPointTrackId,
  WeeklyPointTrackScope,
} from '@/features/points/types/pointSystem';

export function toFixed1(value: number) {
  return Number(value.toFixed(1));
}

export function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function differenceInCalendarDays(left: Date, right: Date) {
  const leftUtc = Date.UTC(left.getFullYear(), left.getMonth(), left.getDate());
  const rightUtc = Date.UTC(right.getFullYear(), right.getMonth(), right.getDate());
  return Math.round((leftUtc - rightUtc) / (24 * 60 * 60 * 1000));
}

export function getConsecutiveRewardPoints(streakDays: number) {
  if (streakDays < 2) {
    return 0;
  }

  return streakDays * 2 - 3;
}

export function getMinimumRunDistanceForStreak(distanceLevel: number) {
  return distanceLevel >= 20 ? 5 : 3;
}

export function buildPointTrack(input: {
  id: WeeklyPointTrackId;
  label: string;
  scope: WeeklyPointTrackScope;
  currentValue: number;
  targetValue: number;
  unit: string;
  rewardPoints: number;
  helperText: string;
  statusText: string;
  badgeText?: string;
  calendar?: StreakCalendar;
}): WeeklyPointTrack {
  return {
    ...input,
    achieved: input.currentValue >= input.targetValue,
    progressPercent: Math.min(100, Math.round((input.currentValue / Math.max(1, input.targetValue)) * 100)),
  };
}
