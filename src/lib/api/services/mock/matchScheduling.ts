import { myProfile, myRunRecords, weeklySummary } from '@/data/mock';
import type { RunMatchResult } from '@/domain/types';
import { getCurrentUserProfile } from '@/lib/session';
import type {
  FetchMatchDemandSummaryInput,
  MatchDemandSummaryResponse,
  RunningMatchRoomResponse,
  UpcomingRunningMatchesResponse,
} from '../../types';

export const mockDuelMatchPool = [
  {
    id: 'duel-runner-1',
    name: '박지훈',
    tag: '#PJ82Q',
    districtName: '송파구',
    averagePace: '05:18/km',
    weeklyDistanceKm: 31.2,
    lifetimeDistanceKm: 182.4,
  },
  {
    id: 'duel-runner-2',
    name: '한예린',
    tag: '#HY55R',
    districtName: '마포구',
    averagePace: '05:34/km',
    weeklyDistanceKm: 24.6,
    lifetimeDistanceKm: 149.1,
  },
  {
    id: 'duel-runner-3',
    name: '정이안',
    tag: '#JI20M',
    districtName: '성동구',
    averagePace: '05:49/km',
    weeklyDistanceKm: 19.8,
    lifetimeDistanceKm: 98.7,
  },
  {
    id: 'duel-runner-4',
    name: '윤서준',
    tag: '#YS44K',
    districtName: '강서구',
    averagePace: '06:08/km',
    weeklyDistanceKm: 16.2,
    lifetimeDistanceKm: 74.3,
  },
];

export const RECOMMENDED_MATCH_DISTANCES = [3, 5, 7, 10, 15, 21.1, 42.2];
export const DUEL_MIN_COMPATIBILITY_SCORE = 72;
export const GROUP_MIN_COMPATIBILITY_SCORE = 68;
export const GROUP_MIN_PARTICIPANTS = 5;
export const MATCH_BOOKING_CUTOFF_MS = 30 * 60 * 1000;
export const MATCH_CANCELLATION_CUTOFF_MS = 60 * 60 * 1000;
export const MATCH_RUNNING_STALE_MS = 90 * 1000;
export const MATCH_BACKGROUND_STALE_MS = 20 * 60 * 1000;
export const MATCH_TEST_COUNTDOWN_SECONDS = 30;
export const STALE_MATCHED_HIDE_MS = 10 * 60 * 1000;
export const STALE_ACTIVE_MATCH_HIDE_MS = 8 * 60 * 60 * 1000;

export function formatMockTimestamp(date = new Date()) {
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

export function getResponseNowMs(serverNow?: string) {
  const parsedMs = serverNow ? new Date(serverNow).getTime() : NaN;
  return Number.isFinite(parsedMs) ? parsedMs : Date.now();
}

export function shouldHideStaleUpcomingMatch(
  match: { slotStartAt: string; status: 'matched' | 'active' },
  nowMs: number,
) {
  const slotStartMs = new Date(match.slotStartAt).getTime();

  if (!Number.isFinite(slotStartMs)) {
    return false;
  }

  const elapsedMs = nowMs - slotStartMs;

  if (match.status === 'active') {
    return elapsedMs > STALE_ACTIVE_MATCH_HIDE_MS;
  }

  return elapsedMs > STALE_MATCHED_HIDE_MS;
}

export function sanitizeUpcomingRunningMatchesResponse(payload: UpcomingRunningMatchesResponse): UpcomingRunningMatchesResponse {
  const nowMs = getResponseNowMs(payload.serverNow);

  return {
    ...payload,
    items: payload.items.filter((match) => !shouldHideStaleUpcomingMatch(match, nowMs)),
  };
}

export function sanitizeRunningMatchRoomResponse(payload: RunningMatchRoomResponse): RunningMatchRoomResponse {
  if (!payload.room) {
    return payload;
  }

  const nowMs = getResponseNowMs(payload.serverNow);
  const referenceStartAt = payload.room.linkedMatchSlotStartAt ?? payload.room.slotStartAt;
  const referenceStartMs = new Date(referenceStartAt).getTime();

  if (!Number.isFinite(referenceStartMs)) {
    return payload;
  }

  const elapsedMs = nowMs - referenceStartMs;
  const shouldHideRoom = payload.room.linkedMatchId || payload.room.state === 'countdown'
    ? elapsedMs > STALE_MATCHED_HIDE_MS
    : elapsedMs > STALE_MATCHED_HIDE_MS;

  if (!shouldHideRoom) {
    return payload;
  }

  return {
    ...payload,
    room: null,
  };
}

export function parsePaceLabelToSeconds(pace: string) {
  const matched = String(pace).trim().match(/^(\d{1,2}):(\d{2})\/km$/i);

  if (!matched) {
    return 5 * 60 + 30;
  }

  return Number(matched[1]) * 60 + Number(matched[2]);
}

export function getMockMatchBonusPoints(matchResult?: RunMatchResult | null) {
  if (!matchResult) {
    return 0;
  }

  if (matchResult.mode === 'duel') {
    if (matchResult.resultTone === 'win') {
      return 12;
    }

    if (matchResult.resultTone === 'draw') {
      return 6;
    }

    if (matchResult.resultTone === 'lose') {
      return 3;
    }

    return 0;
  }

  const participantCount = typeof matchResult.participantCount === 'number' ? matchResult.participantCount : 0;
  const rank = typeof matchResult.rank === 'number' ? matchResult.rank : 0;

  if (participantCount < 2 || rank < 1) {
    return 0;
  }

  if (rank === 1) {
    return 15;
  }

  if (rank <= 3) {
    return 10;
  }

  if (rank <= 10) {
    return 6;
  }

  return 4;
}

export function buildMockPointBreakdown(basePoints: number, matchResult?: RunMatchResult | null) {
  const normalizedBasePoints = Math.max(0, Math.round(basePoints));
  const matchBonusPoints = getMockMatchBonusPoints(matchResult);

  return {
    levelPoints: normalizedBasePoints,
    streakPoints: 0,
    growthPoints: 0,
    matchBonusPoints,
    totalPoints: normalizedBasePoints + matchBonusPoints,
  };
}

export function formatSecondsPerKm(seconds: number) {
  const normalizedSeconds = Math.max(0, Math.round(seconds));
  const minutesPart = Math.floor(normalizedSeconds / 60);
  const secondsPart = String(normalizedSeconds % 60).padStart(2, '0');
  return `${minutesPart}:${secondsPart}/km`;
}

export function formatDuelSlotLabel(slotStartAt: string) {
  const slotStart = new Date(slotStartAt);

  if (Number.isNaN(slotStart.getTime())) {
    return '시간대 미정';
  }

  const startHours = String(slotStart.getHours()).padStart(2, '0');
  const startMinutes = String(slotStart.getMinutes()).padStart(2, '0');
  return `${startHours}:${startMinutes}`;
}

export function buildMockTestMatchStartAt() {
  return new Date(Date.now() + MATCH_TEST_COUNTDOWN_SECONDS * 1000).toISOString();
}

export function formatMockMatchSlotDateLabel(slotStartAt: string) {
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

export function getMockMatchBookingClosesAt(slotStartAt: string) {
  const slotStartAtMs = new Date(slotStartAt).getTime();

  if (!Number.isFinite(slotStartAtMs)) {
    return null;
  }

  return new Date(slotStartAtMs - MATCH_BOOKING_CUTOFF_MS).toISOString();
}

export function getMockMatchCancelableUntilAt(slotStartAt: string) {
  const slotStartAtMs = new Date(slotStartAt).getTime();

  if (!Number.isFinite(slotStartAtMs)) {
    return null;
  }

  return new Date(slotStartAtMs - MATCH_CANCELLATION_CUTOFF_MS).toISOString();
}

export function buildPaceBandLabel(baseSecondsPerKm: number) {
  return `${formatSecondsPerKm(baseSecondsPerKm - 15)} ~ ${formatSecondsPerKm(baseSecondsPerKm + 15)}`;
}

export function buildLevelLabel(lifetimeDistanceKm: number) {
  return `Lv.${Math.floor(Math.max(lifetimeDistanceKm, 0) / 10)}`;
}

export function calculateMockCompatibilityScore(
  currentPaceSeconds: number,
  currentLifetimeDistanceKm: number,
  currentWeeklyDistanceKm: number,
  candidate: (typeof mockDuelMatchPool)[number],
  distanceKm: number,
  mode: 'duel' | 'group',
) {
  const currentLevel = Math.floor(Math.max(currentLifetimeDistanceKm, 0) / 10);
  const candidateLevel = Math.floor(Math.max(candidate.lifetimeDistanceKm, 0) / 10);
  const paceGapSeconds = Math.abs(parsePaceLabelToSeconds(candidate.averagePace) - currentPaceSeconds);
  const levelGap = Math.abs(candidateLevel - currentLevel);
  const distanceGap = Math.abs(candidate.weeklyDistanceKm / 3 - distanceKm);
  const weeklyGap = Math.abs(candidate.weeklyDistanceKm - currentWeeklyDistanceKm);
  const penalty = paceGapSeconds * (mode === 'duel' ? 0.22 : 0.16)
    + levelGap * (mode === 'duel' ? 8 : 6.5)
    + distanceGap * (mode === 'duel' ? 2.8 : 2.2)
    + weeklyGap * (mode === 'duel' ? 0.8 : 0.55);

  return Math.max(0, Math.min(100, Number((100 - penalty).toFixed(1))));
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

export function buildDistanceRecommendationHint(distanceKm: number) {
  if (isRecommendedMatchDistance(distanceKm)) {
    return '';
  }

  return `추천 거리 ${findNearestRecommendedDistance(distanceKm)}km로 바꾸면 더 빨리 비슷한 러너가 모일 수 있어요.`;
}

export function estimateMockCurrentPaceSeconds() {
  const paceValues = myRunRecords
    .map((run) => parsePaceLabelToSeconds(run.pace))
    .filter((value) => Number.isFinite(value));

  if (!paceValues.length) {
    return 5 * 60 + 30;
  }

  return Math.round(paceValues.reduce((sum, value) => sum + value, 0) / paceValues.length);
}

export function buildMockMatchDemandSummary(input: FetchMatchDemandSummaryInput): MatchDemandSummaryResponse {
  const profile = getCurrentUserProfile() ?? myProfile;
  const currentPaceSeconds = estimateMockCurrentPaceSeconds();
  const currentLifetimeDistanceKm = profile.lifetimeDistanceKm ?? weeklySummary.totalDistanceKm;
  const currentWeeklyDistanceKm = weeklySummary.totalDistanceKm;
  const capacity = input.mode === 'duel' ? 2 : 30;
  const compatibleThreshold = input.mode === 'duel' ? DUEL_MIN_COMPATIBILITY_SCORE : GROUP_MIN_COMPATIBILITY_SCORE;
  const matchingCandidates = [...mockDuelMatchPool]
    .map((candidate) => ({
      candidate,
      score: calculateMockCompatibilityScore(
        currentPaceSeconds,
        currentLifetimeDistanceKm,
        currentWeeklyDistanceKm,
        candidate,
        input.distanceKm,
        input.mode,
      ),
    }))
    .filter((entry) => entry.score >= compatibleThreshold)
    .sort((left, right) => right.score - left.score)
    .slice(0, input.mode === 'duel' ? 1 : Math.min(capacity - 1, mockDuelMatchPool.length))
    .map((entry) => entry.candidate);

  const paceSamples = [currentPaceSeconds, ...matchingCandidates.map((candidate) => parsePaceLabelToSeconds(candidate.averagePace))];
  const averagePaceSeconds = Math.round(paceSamples.reduce((sum, value) => sum + value, 0) / paceSamples.length);
  const participantsCount = Math.min(capacity, matchingCandidates.length + 1);
  const distanceRecommendationHint = buildDistanceRecommendationHint(input.distanceKm);

  return {
    success: true,
    mode: input.mode,
    distanceKm: Number(input.distanceKm.toFixed(1)),
    slotStartAt: input.slotStartAt,
    slotLabel: formatDuelSlotLabel(input.slotStartAt),
    averagePace: formatSecondsPerKm(averagePaceSeconds),
    participantsCount,
    competitiveParticipantsCount: participantsCount,
    capacity,
    fillRatioLabel: `${participantsCount}/${capacity}`,
    paceBandLabel: buildPaceBandLabel(averagePaceSeconds),
    summaryText: input.mode === 'duel'
      ? `현재 이 시간대에는 바로 붙일 만한 러너 ${participantsCount}/${capacity}명이 있고, 평균 페이스는 ${formatSecondsPerKm(averagePaceSeconds)}예요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
      : `현재 이 시간대에는 비슷한 그룹 러너 ${participantsCount}/${capacity}명이 있고, 평균 페이스는 ${formatSecondsPerKm(averagePaceSeconds)}예요.${participantsCount < GROUP_MIN_PARTICIPANTS ? ` 최소 ${GROUP_MIN_PARTICIPANTS}명은 모여야 시작해요.` : ''}${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
  };
}
