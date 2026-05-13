import type { MatchRoomMeridiem } from '@/features/runs/types/matchRoom';

export const MATCH_ROOM_HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
export const MATCH_ROOM_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => index);
export const MATCH_ROOM_DISTANCE_OPTIONS = [3, 5, 7, 10, 15, 21.1, 42.2];

export function formatRoomDateLabel(value: string) {
  const date = new Date(value);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  const hour = date.getHours();
  const minute = `${date.getMinutes()}`.padStart(2, '0');

  return `${month}.${day} (${weekday}) ${hour}:${minute}`;
}

export function to12HourParts(value: string) {
  const date = new Date(value);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const meridiem: MatchRoomMeridiem = hours >= 12 ? '오후' : '오전';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;

  return { meridiem, hour12, minute: minutes };
}

export function buildScheduledStartAt(meridiem: MatchRoomMeridiem, hour12: number, minute: number) {
  const now = new Date();
  const candidate = new Date(now);
  const hour24 = meridiem === '오전'
    ? (hour12 === 12 ? 0 : hour12)
    : (hour12 === 12 ? 12 : hour12 + 12);
  candidate.setSeconds(0, 0);
  candidate.setHours(hour24, minute, 0, 0);

  while (candidate.getTime() <= Date.now() + 30 * 60 * 1000) {
    candidate.setDate(candidate.getDate() + 1);
  }

  return candidate.toISOString();
}
