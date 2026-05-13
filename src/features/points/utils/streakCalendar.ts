import type { MyRunRecord } from '@/domain';
import type { StreakCalendar, StreakCalendarCell } from '@/features/points/types/pointSystem';
import {
  differenceInCalendarDays,
  getConsecutiveRewardPoints,
  getDateKey,
  toFixed1,
} from '@/features/points/utils/pointRewards';

type StreakRewardMaps = {
  rewardByDate: Map<string, number>;
  streakByDate: Map<string, number>;
};

function collectQualifiedRunDates(runs: MyRunRecord[], currentDate: Date, minimumRunDistanceKm: number) {
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const distanceByDate = new Map<string, number>();

  runs.forEach((run) => {
    distanceByDate.set(run.date, toFixed1((distanceByDate.get(run.date) ?? 0) + run.distanceKm));
  });

  return [...distanceByDate.entries()]
    .filter(([, distanceKm]) => distanceKm >= minimumRunDistanceKm)
    .map(([date]) => date)
    .filter((date) => {
      const parsed = new Date(`${date}T00:00:00`);
      return parsed >= monthStart && parsed <= monthEnd;
    });
}

function buildStreakRewardMaps(sortedRunDates: Date[]): StreakRewardMaps {
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

  return { rewardByDate, streakByDate };
}

function getCurrentStreakDays(sortedRunDates: Date[], streakByDate: Map<string, number>, currentDate: Date) {
  const todayKey = getDateKey(currentDate);
  const yesterday = new Date(currentDate);
  yesterday.setDate(currentDate.getDate() - 1);
  const yesterdayKey = getDateKey(yesterday);
  const latestRunDate = sortedRunDates.at(-1);
  const latestRunKey = latestRunDate ? getDateKey(latestRunDate) : null;

  return latestRunKey && (latestRunKey === todayKey || latestRunKey === yesterdayKey)
    ? (streakByDate.get(latestRunKey) ?? 0)
    : 0;
}

function buildCalendarCells(currentDate: Date, monthRunKeys: Set<string>, rewardByDate: Map<string, number>) {
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const todayKey = getDateKey(currentDate);
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
    const key = getDateKey(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));

    cells.push({
      key,
      dayNumber: day,
      didRun: monthRunKeys.has(key),
      earnedPoints: rewardByDate.get(key) ?? 0,
      isToday: key === todayKey,
      isPlaceholder: false,
    });
  }

  return cells;
}

export function buildStreakCalendar(
  runs: MyRunRecord[],
  currentDate: Date,
  minimumRunDistanceKm: number,
): StreakCalendar {
  const qualifiedRunDates = collectQualifiedRunDates(runs, currentDate, minimumRunDistanceKm);
  const monthRunKeys = new Set(qualifiedRunDates);
  const sortedRunDates = [...monthRunKeys]
    .map((date) => new Date(`${date}T00:00:00`))
    .sort((left, right) => left.getTime() - right.getTime());
  const { rewardByDate, streakByDate } = buildStreakRewardMaps(sortedRunDates);
  const currentStreakDays = getCurrentStreakDays(sortedRunDates, streakByDate, currentDate);
  const monthlyEarnedPoints = [...rewardByDate.values()].reduce((sum, points) => sum + points, 0);

  return {
    monthLabel: `${currentDate.getFullYear()}년 ${currentDate.getMonth() + 1}월`,
    weekdayLabels: ['월', '화', '수', '목', '금', '토', '일'],
    currentStreakDays,
    nextRewardPoints: getConsecutiveRewardPoints(currentStreakDays + 1),
    monthlyEarnedPoints,
    cells: buildCalendarCells(currentDate, monthRunKeys, rewardByDate),
  };
}
