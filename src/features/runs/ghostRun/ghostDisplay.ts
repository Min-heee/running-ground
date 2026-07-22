import type { GhostRecord } from './ghostTrackCodec';

// Shared display formatting for ghost records (save prompt + 대기방 slots).

export function formatGhostDistance(record: GhostRecord): string {
  return `${(record.distanceM / 1000).toFixed(1)}km`;
}

export function formatGhostDuration(record: GhostRecord): string {
  const total = Math.max(0, Math.round(record.durationSec));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatGhostPace(record: GhostRecord): string {
  if (record.distanceM <= 0) {
    return "-'--\"";
  }

  const paceSecPerKm = Math.round(record.durationSec / (record.distanceM / 1000));
  const minutes = Math.floor(paceSecPerKm / 60);
  const seconds = paceSecPerKm % 60;
  return `${minutes}'${String(seconds).padStart(2, '0')}"/km`;
}

export function formatGhostDate(record: GhostRecord): string {
  const raw = record.startedAt ?? record.savedAt;
  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return '기록';
  }

  return `${parsed.getMonth() + 1}월 ${parsed.getDate()}일`;
}
