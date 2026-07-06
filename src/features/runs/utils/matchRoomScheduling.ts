export const MATCH_ROOM_DISTANCE_OPTIONS = [3, 5, 7, 10, 15, 21.1, 42.195];

export function formatRoomDateLabel(value: string) {
  const date = new Date(value);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  const hour = date.getHours();
  const minute = `${date.getMinutes()}`.padStart(2, '0');

  return `${month}.${day} (${weekday}) ${hour}:${minute}`;
}
