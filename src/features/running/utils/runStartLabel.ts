import type { MyRunRecord } from '@/domain';

export function formatRunStartLabel(run: Pick<MyRunRecord, 'date' | 'startedAt'>): string {
  const baseDate = new Date(`${run.date}T00:00:00`);
  const weekday = Number.isNaN(baseDate.getTime())
    ? ''
    : baseDate.toLocaleDateString('ko-KR', { weekday: 'long' });
  const datePart = [run.date, weekday].filter(Boolean).join(' ');

  if (!run.startedAt) {
    return datePart;
  }

  const startedAt = new Date(run.startedAt);
  if (Number.isNaN(startedAt.getTime())) {
    return datePart;
  }

  const timePart = startedAt.toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    hour12: true,
    minute: '2-digit',
  });

  return `${datePart} ${timePart}`;
}

// The local-clock start time, e.g. '오후 10:44'. startedAt is stored as a UTC ISO string,
// so we MUST go through Date + toLocaleTimeString — slicing the raw ISO ('HH:MM') would
// show the UTC time (9h off in KST), which reads as a wrong "이상한 시간".
export function formatRunStartTime(startedAt?: string | null): string | null {
  if (!startedAt) {
    return null;
  }

  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    hour12: true,
    minute: '2-digit',
  });
}
