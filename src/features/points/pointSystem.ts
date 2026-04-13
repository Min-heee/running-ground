import { MyRunRecord, WeeklySummary } from '@/domain/types';

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

function toFixed1(value: number) {
  return Number(value.toFixed(1));
}

function getDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function differenceInCalendarDays(left: Date, right: Date) {
  const leftUtc = Date.UTC(left.getFullYear(), left.getMonth(), left.getDate());
  const rightUtc = Date.UTC(right.getFullYear(), right.getMonth(), right.getDate());
  return Math.round((leftUtc - rightUtc) / (24 * 60 * 60 * 1000));
}

function getConsecutiveRewardPoints(streakDays: number) {
  if (streakDays < 2) {
    return 0;
  }

  return streakDays * 2 - 1;
}

function buildTrack(input: {
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

function buildStreakCalendar(runs: MyRunRecord[], currentDate: Date): StreakCalendar {
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const monthRunKeys = new Set(
    runs
      .map((run) => run.date)
      .filter((date) => {
        const parsed = new Date(`${date}T00:00:00`);
        return parsed >= monthStart && parsed <= monthEnd;
      }),
  );

  const sortedRunDates = [...monthRunKeys]
    .map((date) => new Date(`${date}T00:00:00`))
    .sort((left, right) => left.getTime() - right.getTime());

  const rewardByDate = new Map<string, number>();
  const streakByDate = new Map<string, number>();
  let previousRunDate: Date | null = null;

  sortedRunDates.forEach((runDate) => {
    const previousKey = previousRunDate ? getDateKey(previousRunDate) : null;
    const streakDays = previousRunDate && differenceInCalendarDays(runDate, previousRunDate) === 1
      ? (previousKey ? streakByDate.get(previousKey) ?? 1 : 1) + 1
      : 1;
    const key = getDateKey(runDate);

    streakByDate.set(key, streakDays);
    rewardByDate.set(key, getConsecutiveRewardPoints(streakDays));
    previousRunDate = runDate;
  });

  const todayKey = getDateKey(currentDate);
  const yesterday = new Date(currentDate);
  yesterday.setDate(currentDate.getDate() - 1);
  const yesterdayKey = getDateKey(yesterday);
  const latestRunDate = sortedRunDates.at(-1);
  const latestRunKey = latestRunDate ? getDateKey(latestRunDate) : null;
  const currentStreakDays = latestRunKey && (latestRunKey === todayKey || latestRunKey === yesterdayKey)
    ? (streakByDate.get(latestRunKey) ?? 0)
    : 0;
  const nextRewardPoints = getConsecutiveRewardPoints(currentStreakDays + 1);
  const monthlyEarnedPoints = [...rewardByDate.values()].reduce((sum, points) => sum + points, 0);

  const weekdayLabels = ['월', '화', '수', '목', '금', '토', '일'];
  const cells: StreakCalendarCell[] = [];
  const startOffset = (monthStart.getDay() + 6) % 7;

  for (let index = 0; index < startOffset; index += 1) {
    cells.push({
      key: `placeholder-${index}`,
      didRun: false,
      earnedPoints: 0,
      isToday: false,
      isPlaceholder: true,
    });
  }

  for (let day = 1; day <= monthEnd.getDate(); day += 1) {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const key = getDateKey(date);

    cells.push({
      key,
      dayNumber: day,
      didRun: monthRunKeys.has(key),
      earnedPoints: rewardByDate.get(key) ?? 0,
      isToday: key === todayKey,
      isPlaceholder: false,
    });
  }

  return {
    monthLabel: `${currentDate.getFullYear()}년 ${currentDate.getMonth() + 1}월`,
    weekdayLabels,
    currentStreakDays,
    nextRewardPoints,
    monthlyEarnedPoints,
    cells,
  };
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
  const streakCalendar = buildStreakCalendar(options?.runs ?? [], currentDate);
  const normalizedLifetimeDistanceKm = toFixed1(Math.max(options?.lifetimeDistanceKm ?? summary.totalDistanceKm, summary.totalDistanceKm));
  const distanceLevel = Math.floor(normalizedLifetimeDistanceKm / 10);
  const nextDistanceTargetKm = Math.max(10, (distanceLevel + 1) * 10);
  const distanceLevelProgressKm = normalizedLifetimeDistanceKm % 10;
  const distanceLevelProgressPercent = Math.round((distanceLevelProgressKm / 10) * 100);
  const distanceLevelRemainingKm = toFixed1(nextDistanceTargetKm - normalizedLifetimeDistanceKm);
  const previousWeekDistanceKm = toFixed1(Math.max(0, summary.totalDistanceKm - Math.max(4, summary.totalRuns * 1.4)));
  const improvementDistanceKm = toFixed1(Math.max(0, summary.totalDistanceKm - previousWeekDistanceKm));

  const tracks: WeeklyPointTrack[] = [
    {
      id: 'distance',
      label: '거리',
      scope: 'lifetime',
      currentValue: normalizedLifetimeDistanceKm,
      targetValue: nextDistanceTargetKm,
      unit: 'km',
      rewardPoints: 10,
      progressPercent: Math.min(100, Math.max(0, distanceLevelProgressPercent)),
      achieved: false,
      helperText: '누적 거리 10km마다 1레벨업하고 포인트를 받아요.',
      statusText: `다음 레벨까지 ${distanceLevelRemainingKm}km`,
      badgeText: `Lv.${distanceLevel}`,
    },
    buildTrack({
      id: 'streak',
      label: '연속 러닝',
      scope: 'weekly',
      currentValue: streakCalendar.currentStreakDays,
      targetValue: Math.max(2, streakCalendar.currentStreakDays + 1),
      unit: '일',
      rewardPoints: streakCalendar.nextRewardPoints,
      helperText: '',
      statusText: streakCalendar.currentStreakDays >= 1
        ? `오늘 이어가면 +${streakCalendar.nextRewardPoints}P`
        : '다시 1일차부터 시작 · 2일 연속부터 포인트 지급',
      calendar: streakCalendar,
    }),
    buildTrack({
      id: 'growth',
      label: '저번주 대비',
      scope: 'weekly',
      currentValue: improvementDistanceKm,
      targetValue: 5,
      unit: 'km',
      rewardPoints: 12,
      helperText: '지난주보다 5km 더 달리면 성장 포인트를 받아요.',
      statusText: improvementDistanceKm >= 5
        ? '성장 기준 달성 · +12P'
        : `${toFixed1(5 - improvementDistanceKm)}km 더 늘리면 +12P`,
    }),
  ];

  return {
    totalPoints: streakCalendar.monthlyEarnedPoints + tracks
      .filter((track) => track.id === 'growth' && track.achieved)
      .reduce((sum, track) => sum + track.rewardPoints, 0),
    lifetimeDistanceKm: normalizedLifetimeDistanceKm,
    distanceLevel,
    distanceLevelPoints: distanceLevel * 10,
    previousWeekDistanceKm,
    improvementDistanceKm,
    tracks,
  };
}
