import { myProfile, myRunRecords, weeklySummary } from '@/data/mock';
import type { RunMatchResult } from '@/domain/types';
import { getCurrentUserProfile } from '@/lib/session';
import type {
  FetchMatchDemandSummaryInput,
  FetchRunningMatchStatusInput,
  MatchDemandSummaryResponse,
  RequestDuelMatchInput,
  RequestDuelMatchResponse,
  RequestGroupMatchInput,
  RequestGroupMatchResponse,
  RunningMatchRoomResponse,
  RunningMatchStatusResponse,
  UpcomingRunningMatchesResponse,
} from '../../types';
import { mockApiState } from './state';

export type MockMatchLiveStatus = 'ready' | 'running' | 'background' | 'paused' | 'disconnected' | 'forfeited' | 'finished';

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

export function buildMockDuelMatchResponse(input: RequestDuelMatchInput): RequestDuelMatchResponse {
  const profile = getCurrentUserProfile() ?? myProfile;
  const currentPaceSeconds = estimateMockCurrentPaceSeconds();
  const currentLifetimeDistanceKm = profile.lifetimeDistanceKm ?? weeklySummary.totalDistanceKm;
  const currentWeeklyDistanceKm = weeklySummary.totalDistanceKm;
  const distanceRecommendationHint = buildDistanceRecommendationHint(input.distanceKm);

  const bestCandidate = [...mockDuelMatchPool]
    .map((candidate) => ({
      candidate,
      score: calculateMockCompatibilityScore(
        currentPaceSeconds,
        currentLifetimeDistanceKm,
        currentWeeklyDistanceKm,
        candidate,
        input.distanceKm,
        'duel',
      ),
    }))
    .sort((left, right) => right.score - left.score)[0];

  if (input.testMode) {
    const testOpponent = bestCandidate?.candidate ?? mockDuelMatchPool[0];
    const testOpponentLevelLabel = buildLevelLabel(testOpponent.lifetimeDistanceKm);
    const countdownStartAt = buildMockTestMatchStartAt();

    return {
      success: true,
      matched: true,
      isTestMatch: true,
      requestId: `mock-duel-test-${Date.now()}`,
      distanceKm: Number(input.distanceKm.toFixed(1)),
      slotStartAt: countdownStartAt,
      slotLabel: formatDuelSlotLabel(countdownStartAt),
      paceBandLabel: buildPaceBandLabel(currentPaceSeconds),
      levelBandLabel: `${buildLevelLabel(currentLifetimeDistanceKm)} 전후`,
      criteriaSummary: '테스트용 1대1 매칭이 잡혔어요. 30초 뒤 바로 시작해요.',
      estimatedWaitMinutes: 0,
      opponent: {
        ...testOpponent,
        name: `테스트 ${testOpponent.name}`,
        levelLabel: testOpponentLevelLabel,
        compatibilitySummary: `${testOpponent.averagePace} 페이스 · ${testOpponentLevelLabel} · 테스트 상대`,
      },
    };
  }

  if (!bestCandidate || bestCandidate.score < DUEL_MIN_COMPATIBILITY_SCORE) {
    return {
      success: true,
      matched: false,
      requestId: `mock-duel-${Date.now()}`,
      distanceKm: Number(input.distanceKm.toFixed(1)),
      slotStartAt: input.slotStartAt,
      slotLabel: formatDuelSlotLabel(input.slotStartAt),
      paceBandLabel: buildPaceBandLabel(currentPaceSeconds),
      levelBandLabel: `${buildLevelLabel(currentLifetimeDistanceKm)} 전후`,
      criteriaSummary: `지금 이 시간대에는 사람이 있어도 페이스나 레벨 차이가 커서 바로 붙이지 않았어요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
      estimatedWaitMinutes: 10,
    };
  }

  const opponent = bestCandidate.candidate;
  const opponentLevelLabel = buildLevelLabel(opponent.lifetimeDistanceKm);

  return {
    success: true,
    matched: true,
    requestId: `mock-duel-${Date.now()}`,
    distanceKm: Number(input.distanceKm.toFixed(1)),
    slotStartAt: input.slotStartAt,
    slotLabel: formatDuelSlotLabel(input.slotStartAt),
    paceBandLabel: buildPaceBandLabel(currentPaceSeconds),
    levelBandLabel: `${buildLevelLabel(currentLifetimeDistanceKm)} 전후`,
    criteriaSummary: '최근 평균 페이스와 누적 거리 레벨이 비슷한 러너를 먼저 붙였어요.',
    estimatedWaitMinutes: 0,
    opponent: {
      ...opponent,
      levelLabel: opponentLevelLabel,
      compatibilitySummary: `${opponent.averagePace} 페이스 · ${opponentLevelLabel} · ${opponent.weeklyDistanceKm.toFixed(1)}km/주 · 적합도 ${bestCandidate.score.toFixed(0)}점`,
    },
  };
}

export function buildMockGroupMatchResponse(input: RequestGroupMatchInput): RequestGroupMatchResponse {
  const profile = getCurrentUserProfile() ?? myProfile;
  const currentPaceSeconds = estimateMockCurrentPaceSeconds();
  const currentLifetimeDistanceKm = profile.lifetimeDistanceKm ?? weeklySummary.totalDistanceKm;
  const currentWeeklyDistanceKm = weeklySummary.totalDistanceKm;
  const currentLevelLabel = buildLevelLabel(currentLifetimeDistanceKm);
  const currentParticipantId = profile.publicTag || 'current-runner';
  const maxGroupSize = 30;
  const distanceRecommendationHint = buildDistanceRecommendationHint(input.distanceKm);
  const selectedCandidates = [...mockDuelMatchPool]
    .map((candidate) => ({
      candidate,
      score: calculateMockCompatibilityScore(
        currentPaceSeconds,
        currentLifetimeDistanceKm,
        currentWeeklyDistanceKm,
        candidate,
        input.distanceKm,
        'group',
      ),
    }))
    .filter((entry) => entry.score >= GROUP_MIN_COMPATIBILITY_SCORE)
    .sort((left, right) => right.score - left.score)
    .slice(0, maxGroupSize - 1)
    .map((entry) => entry.candidate);

  if (input.testMode) {
    const countdownStartAt = buildMockTestMatchStartAt();
    const testParticipants = [
      {
        id: currentParticipantId,
        name: profile.name,
        tag: profile.publicTag,
        districtName: profile.districtName,
        averagePace: formatSecondsPerKm(currentPaceSeconds),
        levelLabel: currentLevelLabel,
        weeklyDistanceKm: weeklySummary.totalDistanceKm,
        lifetimeDistanceKm: currentLifetimeDistanceKm,
        seedRank: 0,
        seedSummary: '',
      },
      ...Array.from({ length: 1 }, (_, index) => {
        const baseCandidate = selectedCandidates[index % Math.max(selectedCandidates.length, 1)] ?? mockDuelMatchPool[index % mockDuelMatchPool.length];
        return {
          ...baseCandidate,
          id: `group-test-${index + 1}`,
          name: `테스트 러너 ${index + 1}`,
          levelLabel: buildLevelLabel(baseCandidate.lifetimeDistanceKm),
          seedRank: 0,
          seedSummary: '',
        };
      }),
    ]
      .sort((left, right) => parsePaceLabelToSeconds(left.averagePace) - parsePaceLabelToSeconds(right.averagePace))
      .map((participant, index) => ({
        ...participant,
        seedRank: index + 1,
        seedSummary: `${index + 1}번 시드 · ${participant.averagePace}`,
      }));
    const mySeedRank = testParticipants.find((participant) => participant.id === currentParticipantId)?.seedRank ?? 1;

    return {
      success: true,
      matched: true,
      isTestMatch: true,
      requestId: `mock-group-test-${Date.now()}`,
      distanceKm: Number(input.distanceKm.toFixed(1)),
      slotStartAt: countdownStartAt,
      slotLabel: formatDuelSlotLabel(countdownStartAt),
      paceBandLabel: buildPaceBandLabel(currentPaceSeconds),
      levelBandLabel: `${currentLevelLabel} 전후`,
      criteriaSummary: '테스트용 그룹 매칭이 잡혔어요. 30초 뒤 바로 시작해요.',
      estimatedWaitMinutes: 0,
      maxGroupSize,
      participantsCount: testParticipants.length,
      mySeedRank,
      participants: testParticipants,
    };
  }

  if (!selectedCandidates.length) {
    return {
      success: true,
      matched: false,
      requestId: `group-request-${Date.now()}`,
      distanceKm: Number(input.distanceKm.toFixed(1)),
      slotStartAt: input.slotStartAt,
      slotLabel: formatDuelSlotLabel(input.slotStartAt),
      paceBandLabel: buildPaceBandLabel(currentPaceSeconds),
      levelBandLabel: `${currentLevelLabel} 전후`,
      criteriaSummary: `아직 같은 시간대 그룹에 모인 비슷한 러너가 적어요. 최소 ${GROUP_MIN_PARTICIPANTS}명은 모여야 시작해요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
      estimatedWaitMinutes: 15,
      maxGroupSize,
      participantsCount: 1,
      mySeedRank: 1,
      participants: [
        {
          id: currentParticipantId,
          name: profile.name,
          tag: profile.publicTag,
          districtName: profile.districtName,
          averagePace: formatSecondsPerKm(currentPaceSeconds),
          levelLabel: currentLevelLabel,
          weeklyDistanceKm: weeklySummary.totalDistanceKm,
          lifetimeDistanceKm: currentLifetimeDistanceKm,
          seedRank: 1,
          seedSummary: '첫 대기 러너',
        },
      ],
    };
  }

  const participants = [
    {
      id: currentParticipantId,
      name: profile.name,
      tag: profile.publicTag,
      districtName: profile.districtName,
      averagePace: formatSecondsPerKm(currentPaceSeconds),
      levelLabel: currentLevelLabel,
      weeklyDistanceKm: weeklySummary.totalDistanceKm,
      lifetimeDistanceKm: currentLifetimeDistanceKm,
      seedRank: 0,
      seedSummary: '',
    },
    ...selectedCandidates.map((candidate) => ({
      ...candidate,
      levelLabel: buildLevelLabel(candidate.lifetimeDistanceKm),
      seedRank: 0,
      seedSummary: '',
    })),
  ]
    .sort((left, right) => {
      const leftScore = parsePaceLabelToSeconds(left.averagePace) * 0.65 + left.weeklyDistanceKm * -1.9 + left.lifetimeDistanceKm * -0.08;
      const rightScore = parsePaceLabelToSeconds(right.averagePace) * 0.65 + right.weeklyDistanceKm * -1.9 + right.lifetimeDistanceKm * -0.08;
      return leftScore - rightScore;
    })
    .map((participant, index) => ({
      ...participant,
      seedRank: index + 1,
      seedSummary: `${index + 1}번 시드 · ${participant.averagePace}`,
    }));

  const mySeedRank = participants.find((participant) => participant.id === currentParticipantId)?.seedRank ?? 1;

  if (participants.length < GROUP_MIN_PARTICIPANTS) {
    return {
      success: true,
      matched: false,
      requestId: `group-request-${Date.now()}`,
      distanceKm: Number(input.distanceKm.toFixed(1)),
      slotStartAt: input.slotStartAt,
      slotLabel: formatDuelSlotLabel(input.slotStartAt),
      paceBandLabel: buildPaceBandLabel(currentPaceSeconds),
      levelBandLabel: `${currentLevelLabel} 전후`,
      criteriaSummary: `현재 비슷한 러너는 ${participants.length}/${maxGroupSize}명이라 아직 그룹을 열지 않았어요. 최소 ${GROUP_MIN_PARTICIPANTS}명은 모여야 재미있는 경쟁이 됩니다.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
      estimatedWaitMinutes: 10,
      maxGroupSize,
      participantsCount: participants.length,
      mySeedRank,
      participants,
    };
  }

  return {
    success: true,
    matched: true,
    requestId: `group-request-${Date.now()}`,
    distanceKm: Number(input.distanceKm.toFixed(1)),
    slotStartAt: input.slotStartAt,
    slotLabel: formatDuelSlotLabel(input.slotStartAt),
    paceBandLabel: buildPaceBandLabel(currentPaceSeconds),
    levelBandLabel: `${currentLevelLabel} 전후`,
    criteriaSummary: '비슷한 페이스와 누적 거리 레벨 러너를 먼저 모아 그룹 대결을 만들었어요.',
    estimatedWaitMinutes: 0,
    maxGroupSize,
    participantsCount: participants.length,
    mySeedRank,
    participants,
  };
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

export function syncMockRunningMatchSession(mode: 'duel' | 'group') {
  const currentSession = mockApiState.runningMatchSessions[mode];

  if (!currentSession) {
    return null;
  }

  const readyToStart = new Date(currentSession.slotStartAt).getTime() <= Date.now();
  const nextSession: RunningMatchStatusResponse = {
    ...currentSession,
    state: currentSession.isTestMatch && readyToStart ? 'active' : currentSession.state,
    readyToStart,
  };
  mockApiState.runningMatchSessions[mode] = nextSession;
  return hydrateMockRunningMatchSessionStatuses(nextSession);
}

export function resolveMockParticipantLiveStatus(
  participant: { liveStatus?: string; liveUpdatedAt?: string; finishedAt?: string },
  now = Date.now(),
): MockMatchLiveStatus {
  if (participant.finishedAt) {
    return 'finished';
  }

  const storedStatus: MockMatchLiveStatus = participant.liveStatus === 'running'
    || participant.liveStatus === 'background'
    || participant.liveStatus === 'paused'
    || participant.liveStatus === 'disconnected'
    || participant.liveStatus === 'forfeited'
    || participant.liveStatus === 'finished'
    || participant.liveStatus === 'ready'
    ? participant.liveStatus
    : 'ready';
  if (!participant.liveUpdatedAt || storedStatus === 'ready' || storedStatus === 'forfeited') {
    return storedStatus;
  }

  const liveUpdatedAtMs = new Date(participant.liveUpdatedAt).getTime();
  if (!Number.isFinite(liveUpdatedAtMs)) {
    return storedStatus;
  }

  const ageMs = now - liveUpdatedAtMs;
  if (storedStatus === 'running' && ageMs > MATCH_RUNNING_STALE_MS) {
    return 'disconnected';
  }

  if ((storedStatus === 'background' || storedStatus === 'paused') && ageMs > MATCH_BACKGROUND_STALE_MS) {
    return 'disconnected';
  }

  return storedStatus;
}

export function hydrateMockRunningMatchSessionStatuses(session: RunningMatchStatusResponse): RunningMatchStatusResponse {
  return {
    ...session,
    currentUserLiveStatus: session.currentUserLiveStatus
      ? resolveMockParticipantLiveStatus({
        liveStatus: session.currentUserLiveStatus,
        liveUpdatedAt: new Date().toISOString(),
      })
      : session.currentUserLiveStatus,
    ...(session.opponent ? {
      opponent: {
        ...session.opponent,
        liveStatus: resolveMockParticipantLiveStatus(session.opponent),
      },
    } : {}),
    ...(session.participants ? {
      participants: session.participants.map((participant) => ({
        ...participant,
        liveStatus: resolveMockParticipantLiveStatus(participant),
      })),
    } : {}),
  };
}

export function buildMockWaitingMatchStatus(input: FetchRunningMatchStatusInput): RunningMatchStatusResponse {
  const summary = buildMockMatchDemandSummary({
    mode: input.mode,
    distanceKm: input.distanceKm,
    slotStartAt: input.slotStartAt,
  });
  const profile = getCurrentUserProfile() ?? myProfile;
  const currentLifetimeDistanceKm = profile.lifetimeDistanceKm ?? weeklySummary.totalDistanceKm;
  const groupPreview = input.mode === 'group'
    ? buildMockGroupMatchResponse({
        distanceKm: input.distanceKm,
        slotStartAt: input.slotStartAt,
      })
    : null;
  const expiresAt = new Date(Date.now() + 90 * 60 * 1000).toISOString();
  const bookingClosesAt = getMockMatchBookingClosesAt(input.slotStartAt) ?? expiresAt;

  return {
    success: true,
    mode: input.mode,
    state: 'waiting',
    distanceKm: summary.distanceKm,
    slotStartAt: summary.slotStartAt,
    slotLabel: summary.slotLabel,
    paceBandLabel: summary.paceBandLabel,
    levelBandLabel: `${buildLevelLabel(currentLifetimeDistanceKm)} 전후`,
    criteriaSummary: summary.summaryText,
    estimatedWaitMinutes: Math.max(1, Math.ceil((new Date(bookingClosesAt).getTime() - Date.now()) / (60 * 1000))),
    participantCount: summary.participantsCount,
    competitiveParticipantsCount: summary.competitiveParticipantsCount,
    acceptedCount: 0,
    capacity: summary.capacity,
    userAccepted: false,
    readyToStart: false,
    expiresAt: bookingClosesAt,
    expiresInSeconds: Math.ceil((new Date(bookingClosesAt).getTime() - Date.now()) / 1000),
    ...(groupPreview ? {
      participants: groupPreview.participants.slice(0, summary.participantsCount),
      mySeedRank: groupPreview.mySeedRank,
    } : {}),
  };
}

export function buildMockDuelMatchStatus(response: RequestDuelMatchResponse): RunningMatchStatusResponse {
  if (!response.matched || !response.opponent) {
    return buildMockWaitingMatchStatus({
      mode: 'duel',
      distanceKm: response.distanceKm,
      slotStartAt: response.slotStartAt,
    });
  }

  const canCancelUntilAt = response.isTestMatch
    ? response.slotStartAt
    : getMockMatchCancelableUntilAt(response.slotStartAt) ?? undefined;

  return {
    success: true,
    mode: 'duel',
    state: 'matched',
    ...(response.isTestMatch ? { isTestMatch: true } : {}),
    matchId: response.requestId,
    distanceKm: response.distanceKm,
    slotStartAt: response.slotStartAt,
    slotLabel: response.slotLabel,
    paceBandLabel: response.paceBandLabel,
    levelBandLabel: response.levelBandLabel,
    criteriaSummary: `${formatMockMatchSlotDateLabel(response.slotStartAt)} ${response.slotLabel}에 비슷한 페이스 상대와 매칭이 잡혔어요.`,
    estimatedWaitMinutes: 0,
    participantCount: 2,
    acceptedCount: 0,
    capacity: 2,
    userAccepted: true,
    readyToStart: new Date(response.slotStartAt).getTime() <= Date.now(),
    currentUserLiveStatus: 'ready',
    canCancel: Boolean(canCancelUntilAt) && Date.now() < new Date(canCancelUntilAt ?? 0).getTime(),
    cancelableUntilAt: canCancelUntilAt,
    expiresAt: getMockMatchBookingClosesAt(response.slotStartAt) ?? undefined,
    expiresInSeconds: getMockMatchBookingClosesAt(response.slotStartAt)
      ? Math.max(0, Math.ceil((new Date(getMockMatchBookingClosesAt(response.slotStartAt)!).getTime() - Date.now()) / 1000))
      : undefined,
    opponent: {
      ...response.opponent,
      accepted: true,
      liveStatus: 'ready',
    },
  };
}

export function buildMockGroupMatchStatus(response: RequestGroupMatchResponse): RunningMatchStatusResponse {
  if (!response.matched) {
    return buildMockWaitingMatchStatus({
      mode: 'group',
      distanceKm: response.distanceKm,
      slotStartAt: response.slotStartAt,
    });
  }

  const canCancelUntilAt = response.isTestMatch
    ? response.slotStartAt
    : getMockMatchCancelableUntilAt(response.slotStartAt) ?? undefined;

  return {
    success: true,
    mode: 'group',
    state: 'matched',
    ...(response.isTestMatch ? { isTestMatch: true } : {}),
    matchId: response.requestId,
    distanceKm: response.distanceKm,
    slotStartAt: response.slotStartAt,
    slotLabel: response.slotLabel,
    paceBandLabel: response.paceBandLabel,
    levelBandLabel: response.levelBandLabel,
    criteriaSummary: `${formatMockMatchSlotDateLabel(response.slotStartAt)} ${response.slotLabel}에 ${response.participantsCount}명 그룹 대결이 잡혔어요.`,
    estimatedWaitMinutes: 0,
    participantCount: response.participantsCount,
    acceptedCount: 0,
    capacity: response.maxGroupSize,
    userAccepted: true,
    readyToStart: new Date(response.slotStartAt).getTime() <= Date.now(),
    currentUserLiveStatus: 'ready',
    canCancel: Boolean(canCancelUntilAt) && Date.now() < new Date(canCancelUntilAt ?? 0).getTime(),
    cancelableUntilAt: canCancelUntilAt,
    expiresAt: getMockMatchBookingClosesAt(response.slotStartAt) ?? undefined,
    expiresInSeconds: getMockMatchBookingClosesAt(response.slotStartAt)
      ? Math.max(0, Math.ceil((new Date(getMockMatchBookingClosesAt(response.slotStartAt)!).getTime() - Date.now()) / 1000))
      : undefined,
    participants: response.participants.map((participant) => ({
      ...participant,
      accepted: true,
      liveStatus: 'ready',
    })),
    mySeedRank: response.mySeedRank,
  };
}
