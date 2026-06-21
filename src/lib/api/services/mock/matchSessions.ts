import { myProfile, weeklySummary } from '@/data/mock';
import { getCurrentUserProfile } from '@/lib/session';
import type {
  DuelMatchOpponent,
  FetchRunningMatchStatusInput,
  GroupMatchParticipant,
  MatchResultParticipant,
  MatchResultResponse,
  RequestDuelMatchInput,
  RequestDuelMatchResponse,
  RequestGroupMatchInput,
  RequestGroupMatchResponse,
  RunningMatchStatusResponse,
} from '../../types';
import {
  DUEL_MIN_COMPATIBILITY_SCORE,
  GROUP_MIN_COMPATIBILITY_SCORE,
  GROUP_MIN_PARTICIPANTS,
  buildDistanceRecommendationHint,
  buildLevelLabel,
  buildMockMatchDemandSummary,
  buildMockTestMatchStartAt,
  buildPaceBandLabel,
  calculateMockCompatibilityScore,
  estimateMockCurrentPaceSeconds,
  formatDuelSlotLabel,
  formatMockMatchSlotDateLabel,
  formatSecondsPerKm,
  getMockMatchBookingClosesAt,
  getMockMatchCancelableUntilAt,
  mockDuelMatchPool,
  parsePaceLabelToSeconds,
} from './matchScheduling';
import { hydrateMockRunningMatchSessionStatuses } from './matchProgress';
import { mockApiState } from './state';

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

// Reconstruct a MatchResultResponse from whatever live mock session currently
// carries this matchId. Mirrors the backend's by-matchId result endpoint enough
// for the result screen to render under USE_MOCK_API. Returns null when no mock
// session matches (mapped to MatchResultNotResolvedError by the caller).
function parseMockPaceLabel(label?: string | null): number | null {
  if (!label || !/\d{1,2}:\d{2}\/km/i.test(label)) {
    return null;
  }

  const seconds = parsePaceLabelToSeconds(label);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function resolveMockPaceSecondsPerKm(
  runner: Pick<DuelMatchOpponent, 'officialAveragePace' | 'livePace' | 'officialElapsedSeconds' | 'liveElapsedSeconds'>,
  distanceKm: number,
): number | null {
  const parsedOfficial = parseMockPaceLabel(runner.officialAveragePace);
  if (parsedOfficial !== null) {
    return parsedOfficial;
  }

  const parsedLive = parseMockPaceLabel(runner.livePace);
  if (parsedLive !== null) {
    return parsedLive;
  }

  const elapsed = runner.officialElapsedSeconds ?? runner.liveElapsedSeconds ?? null;
  if (typeof elapsed === 'number' && Number.isFinite(elapsed) && elapsed > 0 && distanceKm > 0) {
    return Math.round(elapsed / distanceKm);
  }

  return null;
}

export function buildMockMatchResultResponse(matchId: string): MatchResultResponse | null {
  const duelSession = mockApiState.runningMatchSessions.duel;
  const groupSession = mockApiState.runningMatchSessions.group;
  const session = duelSession?.matchId === matchId
    ? duelSession
    : groupSession?.matchId === matchId
      ? groupSession
      : null;

  if (!session) {
    return null;
  }

  const comparedDistanceKm = session.distanceKm;
  const profile = getCurrentUserProfile() ?? myProfile;

  if (session.mode === 'duel') {
    const opponent = session.opponent;
    if (!opponent) {
      return null;
    }

    const myDistanceKm = session.officialComparison?.userDistanceKm ?? comparedDistanceKm;
    const opponentDistanceKm = opponent.officialDistanceKm ?? opponent.liveDistanceKm ?? comparedDistanceKm;
    const verdict = session.duelVerdict;
    const myWon = (verdict?.resolved && verdict.outcome === 'win')
      || (session.currentUserLiveStatus === 'finished' && opponent.liveStatus !== 'finished');
    const isDraw = Boolean(verdict?.resolved && verdict.outcome === 'draw');
    const myRow: MatchResultParticipant = {
      userId: null,
      name: '나',
      districtName: profile.districtName ?? null,
      provinceName: profile.provinceName ?? null,
      cityName: profile.cityName ?? null,
      paceSecondsPerKm: resolveMockPaceSecondsPerKm(
        {
          officialAveragePace: session.officialComparison?.userAveragePace,
          livePace: undefined,
          officialElapsedSeconds: session.currentUserFinishElapsedSeconds ?? undefined,
          liveElapsedSeconds: undefined,
        },
        myDistanceKm,
      ),
      finishElapsedSeconds: session.currentUserFinishElapsedSeconds ?? null,
      distanceKm: myDistanceKm,
      rank: myWon ? 1 : 2,
      resultTone: isDraw ? 'draw' : myWon ? 'win' : 'lose',
      forfeited: session.currentUserLiveStatus === 'forfeited',
      isMe: true,
    };
    const opponentRow: MatchResultParticipant = {
      userId: opponent.id,
      name: opponent.name,
      districtName: opponent.districtName ?? null,
      provinceName: null,
      cityName: null,
      paceSecondsPerKm: resolveMockPaceSecondsPerKm(opponent, opponentDistanceKm),
      finishElapsedSeconds: opponent.finishElapsedSeconds ?? opponent.officialElapsedSeconds ?? null,
      distanceKm: opponentDistanceKm,
      rank: myWon ? 2 : 1,
      resultTone: isDraw ? 'draw' : myWon ? 'lose' : 'win',
      forfeited: opponent.liveStatus === 'forfeited',
      isMe: false,
    };

    return {
      matchId,
      mode: 'duel',
      source: 'official',
      comparedDistanceKm,
      participants: [myRow, opponentRow].sort((left, right) => (left.rank ?? 99) - (right.rank ?? 99)),
    };
  }

  const participants = session.participants ?? [];
  const mySeedRank = session.mySeedRank ?? 1;
  const rows: MatchResultParticipant[] = participants.map((participant: GroupMatchParticipant) => {
    const isMe = participant.seedRank === mySeedRank;
    const distanceKm = participant.officialDistanceKm ?? participant.liveDistanceKm ?? comparedDistanceKm;
    return {
      userId: participant.id,
      name: isMe ? '나' : participant.name,
      districtName: participant.districtName ?? null,
      provinceName: null,
      cityName: null,
      paceSecondsPerKm: resolveMockPaceSecondsPerKm(participant, distanceKm),
      finishElapsedSeconds: participant.finishElapsedSeconds ?? participant.officialElapsedSeconds ?? null,
      distanceKm,
      rank: participant.officialRank ?? participant.seedRank,
      resultTone: null,
      forfeited: participant.liveStatus === 'forfeited',
      isMe,
    };
  });

  return {
    matchId,
    mode: 'group',
    source: 'official',
    comparedDistanceKm,
    participants: rows.sort((left, right) => (left.rank ?? 99) - (right.rank ?? 99)),
  };
}
