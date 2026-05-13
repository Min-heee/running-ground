export type WeeklyPointTrackId = 'distance' | 'streak' | 'growth';
export type WeeklyPointTrackScope = 'lifetime' | 'weekly';

export type StreakCalendarCell = {
  key: string;
  dayNumber?: number;
  didRun: boolean;
  earnedPoints: number;
  isToday: boolean;
  isPlaceholder: boolean;
};

export type StreakCalendar = {
  monthLabel: string;
  weekdayLabels: string[];
  currentStreakDays: number;
  nextRewardPoints: number;
  monthlyEarnedPoints: number;
  cells: StreakCalendarCell[];
};

export type WeeklyPointTrack = {
  id: WeeklyPointTrackId;
  label: string;
  scope: WeeklyPointTrackScope;
  currentValue: number;
  targetValue: number;
  unit: string;
  rewardPoints: number;
  progressPercent: number;
  achieved: boolean;
  helperText: string;
  statusText: string;
  badgeText?: string;
  calendar?: StreakCalendar;
};

export type WeeklyPointOverview = {
  totalPoints: number;
  lifetimeDistanceKm: number;
  distanceLevel: number;
  distanceLevelPoints: number;
  previousWeekDistanceKm: number;
  improvementDistanceKm: number;
  tracks: WeeklyPointTrack[];
};
