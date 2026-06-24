import type { RunMatchResult } from '@/domain';
import { getApiErrorMessage } from '@/services/apiError';

export type MatchTimeSection = 'am' | 'pm';

export type MatchSlotOption = {
  startsAt: string;
  label: string;
  dateKey: string;
  dateLabel: string;
  weekdayLabel: string;
  isClosed: boolean;
};

export type MatchDateOption = {
  key: string;
  label: string;
  subtitle: string;
};

export const RECOMMENDED_MATCH_DISTANCES = [3, 5, 7, 10, 15, 21.1, 42.195];

const MATCH_BOOKING_WINDOW_DAYS = 7;
const MATCH_BOOKING_CUTOFF_MS = 30 * 60 * 1000;
const ESTIMATED_DUEL_WIN_LP_DELTA = 20;
const ESTIMATED_DUEL_LOSS_LP_DELTA = -20;
const GROUP_TOP_LP_DELTA = 20;
const GROUP_MIDDLE_LP_DELTA = 6;
const GROUP_BOTTOM_LP_DELTA = -15;
const GROUP_TOP_RATIO = 0.3;
const GROUP_BOTTOM_RATIO = 0.7;

export function formatMatchTargetDistance(distanceKm: number) {
  return `${Number(distanceKm.toFixed(1))}km`;
}

// Mirrors the backend's buildDuelSlotCountKey (matchQueueStoreHelpers.mjs): the
// upcoming-poll duelSlotCounts map is keyed by `${slotStartAt}|${normalizedDistanceKm}`
// so a slot's "N명 대기" badge reflects only OTHER waiters at the SAME distance the
// viewer has selected (the server already excludes the viewer's own entry). Distance is
// normalized to one decimal exactly like normalizeMatchQueueDistance on the backend.
export function buildDuelSlotCountKey(slotStartAt: string, distanceKm: number) {
  return `${slotStartAt}|${Number(distanceKm.toFixed(1))}`;
}

export function clampDuelMatchDistanceKm(value: number) {
  return Math.min(42.195, Math.max(2, Number(value.toFixed(1))));
}

export function parseDuelMatchDistanceKm(value: string) {
  const parsedValue = Number(String(value).replace(',', '.'));

  if (!Number.isFinite(parsedValue)) {
    return 5;
  }

  return clampDuelMatchDistanceKm(parsedValue);
}

export function isRecommendedMatchDistance(distanceKm: number) {
  return RECOMMENDED_MATCH_DISTANCES.some((recommendedDistanceKm) => Math.abs(recommendedDistanceKm - distanceKm) < 0.15);
}

export function findNearestRecommendedDistance(distanceKm: number) {
  return RECOMMENDED_MATCH_DISTANCES.reduce((closestDistanceKm, candidateDistanceKm) => (
    Math.abs(candidateDistanceKm - distanceKm) < Math.abs(closestDistanceKm - distanceKm)
      ? candidateDistanceKm
      : closestDistanceKm
  ));
}

export function formatMatchDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function resolveMatchTimeSection(slotStartAt: string): MatchTimeSection {
  const slotDate = new Date(slotStartAt);
  const hour = Number.isNaN(slotDate.getTime()) ? 0 : slotDate.getHours();
  return hour < 12 ? 'am' : 'pm';
}

export function isMatchSlotClosed(slotStartAt: string, now = new Date()) {
  const slotStartAtMs = new Date(slotStartAt).getTime();

  if (!Number.isFinite(slotStartAtMs)) {
    return true;
  }

  return slotStartAtMs - MATCH_BOOKING_CUTOFF_MS <= now.getTime();
}

export function buildWeeklyHourlySlots(referenceDate = new Date()): MatchSlotOption[] {
  const baseDate = new Date(referenceDate);
  baseDate.setMinutes(0, 0, 0);
  const maxSelectableAtMs = referenceDate.getTime() + MATCH_BOOKING_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  return Array.from({ length: MATCH_BOOKING_WINDOW_DAYS + 1 }, (_, dayOffset) => {
    const currentDate = new Date(baseDate);
    currentDate.setDate(baseDate.getDate() + dayOffset);
    currentDate.setHours(0, 0, 0, 0);

    return Array.from({ length: 24 }, (_, hour) => {
      const slotStart = new Date(currentDate);
      slotStart.setHours(hour, 0, 0, 0);
      const startsAt = slotStart.toISOString();
      return {
        startsAt,
        label: `${String(hour).padStart(2, '0')}:00`,
        dateKey: formatMatchDateKey(slotStart),
        dateLabel: slotStart.toLocaleDateString('ko-KR', {
          month: 'numeric',
          day: 'numeric',
        }),
        weekdayLabel: slotStart.toLocaleDateString('ko-KR', {
          weekday: 'short',
        }),
        isClosed: isMatchSlotClosed(startsAt, referenceDate),
      };
    });
  })
    .flat()
    .filter((slot) => new Date(slot.startsAt).getTime() <= maxSelectableAtMs);
}

export function buildMatchDateOptions(slotOptions: MatchSlotOption[]): MatchDateOption[] {
  const seen = new Set<string>();
  return slotOptions.filter((slot) => {
    if (seen.has(slot.dateKey)) {
      return false;
    }
    seen.add(slot.dateKey);
    return true;
  }).map((slot) => ({
    key: slot.dateKey,
    label: slot.dateLabel,
    subtitle: slot.weekdayLabel,
  }));
}

export function formatMatchExpiryCountdown(seconds?: number | null) {
  if (typeof seconds !== 'number' || seconds <= 0) {
    return null;
  }

  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.ceil((seconds % 3600) / 60);
    return `${hours}시간 ${minutes}분`;
  }

  if (seconds >= 60) {
    return `${Math.ceil(seconds / 60)}분`;
  }

  return `${seconds}초`;
}

export function buildMatchSlotDateLabel(slotStartAt: string) {
  const slotStart = new Date(slotStartAt);

  if (Number.isNaN(slotStart.getTime())) {
    return '날짜 미정';
  }

  return slotStart.toLocaleDateString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
}

export function getEstimatedMatchBonusPoints(matchResult?: RunMatchResult) {
  if (!matchResult) {
    return 0;
  }

  if (matchResult.mode === 'duel') {
    if (matchResult.resultTone === 'win') {
      return 20;
    }

    if (matchResult.resultTone === 'draw') {
      return 15;
    }

    if (matchResult.resultTone === 'lose') {
      return 10;
    }

    return 0;
  }

  if (matchResult.mode === 'group') {
    if (matchResult.rank === 1) {
      return 25;
    }

    if (matchResult.rank === 2) {
      return 20;
    }

    if (matchResult.rank === 3) {
      return 15;
    }

    if (typeof matchResult.rank === 'number' && matchResult.rank >= 4) {
      return 10;
    }
  }

  return 0;
}

export function getEstimatedMatchLpDelta(matchResult?: RunMatchResult) {
  if (!matchResult) {
    return 0;
  }

  if (matchResult.mode === 'duel') {
    if (matchResult.resultTone === 'win') {
      return ESTIMATED_DUEL_WIN_LP_DELTA;
    }

    if (matchResult.resultTone === 'lose') {
      return ESTIMATED_DUEL_LOSS_LP_DELTA;
    }

    return 0;
  }

  if (matchResult.mode === 'group') {
    const { participantCount, rank } = matchResult;
    const hasValidPlacement = (
      typeof rank === 'number'
      && typeof participantCount === 'number'
      && Number.isFinite(rank)
      && Number.isFinite(participantCount)
      && rank >= 1
      && participantCount >= 1
      && rank <= participantCount
    );

    if (!hasValidPlacement) {
      return 0;
    }

    if (rank <= participantCount * GROUP_TOP_RATIO) {
      return GROUP_TOP_LP_DELTA;
    }

    if (rank > participantCount * GROUP_BOTTOM_RATIO) {
      return GROUP_BOTTOM_LP_DELTA;
    }

    return GROUP_MIDDLE_LP_DELTA;
  }

  return 0;
}

export function isUnsavableShortRunError(error: unknown) {
  const message = getApiErrorMessage(error, String(error ?? ''));

  return [
    '저장하려면 실제로 이동한 러닝 경로가 조금 더 필요해.',
    '페이스 계산이 아직 부족해서 저장할 수 없어.',
    '러닝 경로는 최소 2개 이상의 위치 좌표가 필요해.',
    '러닝 거리를 입력해줘.',
    '페이스를 입력해줘.',
  ].some((snippet) => message.includes(snippet));
}
