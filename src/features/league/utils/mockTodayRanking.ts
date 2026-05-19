import type { TodayRankingCategory, TodayRankingEntry } from '@/domain';

const todayRankingBase = [
  { name: '김관우', tag: '#KW8M4', paceSeconds: 296, distanceKm: 12.6, streakDays: 21 },
  { name: '민병희', tag: '#BH7K2', paceSeconds: 318, distanceKm: 8.2, streakDays: 3 },
  { name: '이서준', tag: '#SJ4Q8', paceSeconds: 305, distanceKm: 10.4, streakDays: 14 },
  { name: '박지훈', tag: '#JH3N1', paceSeconds: 331, distanceKm: 7.8, streakDays: 9 },
  { name: '최민준', tag: '#MJ5T2', paceSeconds: 342, distanceKm: 9.6, streakDays: 17 },
  { name: '정이안', tag: '#IA9L3', paceSeconds: 354, distanceKm: 6.1, streakDays: 5 },
  { name: '이서윤', tag: '#SY1R4', paceSeconds: 366, distanceKm: 5.4, streakDays: 11 },
];

function formatMockPace(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${remainingSeconds}/km`;
}

export function rankMockTodayEntries(
  category: TodayRankingCategory,
  profileTag: string,
): TodayRankingEntry[] {
  return todayRankingBase
    .map((entry, index) => {
      const valueNumber = category === 'pace'
        ? entry.paceSeconds
        : category === 'distance'
          ? entry.distanceKm
          : entry.streakDays;
      const value = category === 'pace'
        ? formatMockPace(entry.paceSeconds)
        : category === 'distance'
          ? `${entry.distanceKm.toFixed(1)}km`
          : `${entry.streakDays}일`;

      return {
        rank: index + 1,
        userId: `mock-today-runner-${index + 1}`,
        name: entry.name,
        tag: entry.tag,
        value,
        valueNumber,
        isCurrentUser: entry.tag === profileTag,
      };
    })
    .sort((left, right) => {
      if (category === 'pace') {
        return left.valueNumber - right.valueNumber || left.name.localeCompare(right.name, 'ko');
      }

      return right.valueNumber - left.valueNumber || left.name.localeCompare(right.name, 'ko');
    })
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
}
