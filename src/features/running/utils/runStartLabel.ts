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
