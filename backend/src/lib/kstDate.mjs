// Shared KST calendar-day anchor. Run dates (run.date) are YYYY-MM-DD strings
// generated on the user's device in Korea time, but the droplet runs on UTC —
// so any aggregate that anchors "today/this week/this month" on the server's
// local date drifts one day behind between 00:00 and 09:00 KST. Same root as
// the validators KST date bug (e73be86); every server-side "current period"
// key must come from here, never from getFullYear()/getMonth()/getDate() on a
// raw `new Date()`.

const KST_DATE_ONLY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// YYYY-MM-DD of the given instant in Korea time.
export function formatKstDateKey(date = new Date()) {
  return KST_DATE_ONLY_FORMAT.format(date);
}

const KST_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// "HH:mm" of the given instant in Korea time (슬롯 라벨 등 표시용).
export function formatKstTimeLabel(date) {
  return KST_TIME_FORMAT.format(date);
}

// "YYYY-MM-DD HH:mm" of the given instant in Korea time. 유저에게 보이는 시각
// 문자열(마지막 확인/동기화 등)은 전부 이걸 거쳐야 한다 — 로컬 getHours()는
// UTC 드롭릿에서 9시간 어긋난다 (실사례: 연동 진단 '마지막 확인' 2026-07-25).
export function formatKstDisplayTimestamp(date = new Date()) {
  return `${KST_DATE_ONLY_FORMAT.format(date)} ${KST_TIME_FORMAT.format(date)}`;
}
