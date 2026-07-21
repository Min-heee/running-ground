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
