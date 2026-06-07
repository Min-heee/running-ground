import type { UpcomingRunningMatchItem } from '@/lib/api/types';

export const MATCH_CARD_COUNTDOWN_WINDOW_SECONDS = 10 * 60;
export const MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS = 30;
export const MATCH_ARENA_HANDOFF_COUNTDOWN_WINDOW_SECONDS = 20;
// Mirrors backend MATCH_ROOM_HOST_START_DELAY_SECONDS: host-start rooms show numeric countdown only for the final 10s.
export const MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS = 10;

export function getMatchStartRemainingSeconds(slotStartAt: string, nowMs = Date.now()) {
  const slotStartAtMs = new Date(slotStartAt).getTime();

  if (!Number.isFinite(slotStartAtMs)) {
    return null;
  }

  const remainingMs = slotStartAtMs - nowMs;

  if (remainingMs <= 0) {
    return null;
  }

  return Math.max(1, Math.round(remainingMs / 1000));
}

export function shouldShowMatchCardCountdown(remainingSeconds: number | null) {
  return typeof remainingSeconds === 'number' && remainingSeconds > 0 && remainingSeconds <= MATCH_CARD_COUNTDOWN_WINDOW_SECONDS;
}

export function shouldShowMatchStartOverlay(remainingSeconds: number | null) {
  return typeof remainingSeconds === 'number' && remainingSeconds > 0 && remainingSeconds <= MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS;
}

export function shouldAutoOpenMatchArena(remainingSeconds: number | null) {
  return typeof remainingSeconds === 'number' && remainingSeconds > 0 && remainingSeconds <= MATCH_ARENA_HANDOFF_COUNTDOWN_WINDOW_SECONDS;
}

export function formatMatchCountdown(remainingSeconds: number) {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function findNextStartingMatchedMatch(matches: UpcomingRunningMatchItem[], nowMs = Date.now()) {
  return matches
    .filter((match) => match.status === 'matched')
    .map((match) => ({
      match,
      remainingSeconds: getMatchStartRemainingSeconds(match.slotStartAt, nowMs),
    }))
    .filter((entry): entry is { match: UpcomingRunningMatchItem; remainingSeconds: number } => typeof entry.remainingSeconds === 'number')
    .sort((left, right) => left.remainingSeconds - right.remainingSeconds)[0] ?? null;
}
