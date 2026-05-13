import type { StreakCalendarCell, WeeklyPointTrack } from '@/features/points/pointSystem';

export function buildHomeOverviewCalendarRows(track: WeeklyPointTrack): StreakCalendarCell[][] {
  if (!track.calendar) {
    return [];
  }

  return Array.from({ length: Math.ceil(track.calendar.cells.length / 7) }, (_, rowIndex) => {
    const row = track.calendar?.cells.slice(rowIndex * 7, rowIndex * 7 + 7) ?? [];

    while (row.length < 7) {
      row.push({
        key: `trailing-placeholder-${rowIndex}-${row.length}`,
        didRun: false,
        earnedPoints: 0,
        isToday: false,
        isPlaceholder: true,
      });
    }

    return row;
  });
}

export function buildHomeOverviewPointHeaderLabel(track: WeeklyPointTrack) {
  if (track.id === 'streak') {
    return '2일차 +1P · 3일차 +3P · n일차 +(2n-3)P';
  }

  if (track.scope === 'lifetime') {
    return `레벨업 시 +${track.rewardPoints}P`;
  }

  return `달성 시 +${track.rewardPoints}P`;
}
