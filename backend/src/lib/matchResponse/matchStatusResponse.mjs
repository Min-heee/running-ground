import {
  DUEL_MIN_COMPATIBILITY_SCORE,
  GROUP_MIN_COMPATIBILITY_SCORE,
  GROUP_MIN_PARTICIPANTS,
  MATCH_BOOKING_CUTOFF_MS,
  MATCH_TEST_GROUP_MIN_PARTICIPANTS,
} from '../matchConstants.mjs';
import {
  buildLevelLabel,
  buildPaceBandLabel,
  formatPaceMinutesLabel,
} from '../matchFormatting.mjs';
import {
  buildDistanceRecommendationHint,
  buildOfficialComparisonSummary,
  buildQueuedParticipants,
  normalizeMatchQueueDistance,
} from '../matchPureHelpers.mjs';
import {
  buildExpirySnapshot,
  buildMatchSlotDateLabel,
  formatDuelSlotLabel as formatDuelSlotLabelFromDateTime,
} from '../dateTimeFormatting.mjs';
import {
  buildMatchCancellationDeadline,
  getMatchQueueEntryExpiresAt,
  isTestMatchSession,
} from '../matchScheduleHelpers.mjs';
import {
  buildDuelVerdict,
  buildGroupVerdict,
  buildMatchRunnerProfile,
  buildOfficialSessionStandings,
  buildParticipantLiveSnapshot,
  findMatchSessionForUser,
  hydrateMatchSessionState,
} from '../runningMatchSessionStoreHelpers.mjs';
import {
  buildQueuedMatchRunnerEntries,
  buildSessionDuelOpponent,
  buildSessionGroupParticipants,
} from './matchResponseParticipants.mjs';

export function buildRunningMatchStatusResponse(store, currentUser, { mode, distanceKm, slotStartAt, testMode = false, matchId, sessionOverride = null } = {}) {
  const now = new Date();
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const paceBandLabel = buildPaceBandLabel(currentRunner.averagePaceMinutes);
  const levelBandLabel = `${buildLevelLabel(currentRunner.distanceLevel)} 전후`;
  const session = sessionOverride ?? findMatchSessionForUser(store, mode, currentUser.id, {
    distanceKm,
    slotStartAt,
    testMode,
    matchId,
  });
  const capacity = mode === 'duel' ? 2 : 30;
  const distanceRecommendationHint = buildDistanceRecommendationHint(distanceKm);

  if (session) {
    const hydratedState = hydrateMatchSessionState(session, now);
    const isTestMatch = isTestMatchSession(session);
    const readyToStart = new Date(session.slotStartAt).getTime() <= now.getTime();
    // STAGE 2 (clean core) — slot-gate the reported state, mirroring the room gate (52a9a17).
    // The SHARED session hydrates to 'active' the instant ANY participant pushes live progress
    // (the host's pre-start warm-up, which can land 60-90s BEFORE this match's slot). This DIRECT
    // matched-duel/group status endpoint must NOT report 'active' before the slot, or a consumer
    // keyed off duel/groupMatchStatus.state === 'active' would skip the guest past their countdown.
    // Report 'matched' (with countdownRemainingSeconds) until the slot passes, then 'active'. The
    // underlying session/live data is unchanged — only the client-facing state label is gated.
    const state = hydratedState === 'active' && !readyToStart ? 'matched' : hydratedState;
    const cancelableUntilAt = buildMatchCancellationDeadline(session.slotStartAt, {
      isTestMatch,
      isPartyRun: session.isScheduledPartyRun === true,
    }).toISOString();
    const canCancelReservation = now.getTime() < new Date(cancelableUntilAt).getTime();
    const countdownRemainingSeconds = state === 'matched' && !readyToStart
      ? Math.max(0, Math.ceil((new Date(session.slotStartAt).getTime() - now.getTime()) / 1000))
      : undefined;
    const sessionSlotLabel = formatDuelSlotLabelFromDateTime(session.slotStartAt);
    const officialStandings = buildOfficialSessionStandings(store, session, now);
    const officialComparison = buildOfficialComparisonSummary(officialStandings, currentUser.id);
    const currentParticipant = session.participants.find((participant) => participant.userId === currentUser.id);
    const currentUserLiveSnapshot = currentParticipant
      ? buildParticipantLiveSnapshot(session, currentParticipant, now)
      : null;

    if (mode === 'duel') {
      const opponent = buildSessionDuelOpponent(store, session, currentUser.id, now, officialStandings);
      // The duel verdict is the single source of truth for who won (server-decided
      // by MEASURED finish elapsed). The self standing surfaces the requesting user's
      // OWN authoritative finish the same way opponent finish fields are surfaced.
      const duelVerdict = buildDuelVerdict(session, officialStandings, currentUser.id, now);
      const currentUserStanding = officialStandings.find((standing) => standing.userId === currentUser.id) ?? null;
      const myFinishElapsedSeconds = Number.isInteger(currentUserStanding?.finishElapsedSeconds)
        ? currentUserStanding.finishElapsedSeconds
        : null;
      return {
        success: true,
        serverNow: now.toISOString(),
        mode,
        state,
        ...(isTestMatch ? { isTestMatch: true } : {}),
        matchId: session.id,
        distanceKm: session.distanceKm,
        slotStartAt: session.slotStartAt,
        slotLabel: sessionSlotLabel,
        paceBandLabel,
        levelBandLabel,
        criteriaSummary: isTestMatch
          ? state === 'matched'
            ? `${opponent?.name ?? '상대'}님과 테스트 매치가 잡혔어요. 30초 카운트다운이 끝나면 바로 시작돼요.`
            : '테스트 대결이 시작됐어요. 상대와 거리 차이를 바로 확인할 수 있어요.'
          : state === 'matched'
            ? readyToStart
              ? `매칭이 잡혔어요. ${buildMatchSlotDateLabel(session.slotStartAt)} ${sessionSlotLabel} 대결을 이제 시작할 수 있어요.`
              : `매칭이 잡혔어요. ${buildMatchSlotDateLabel(session.slotStartAt)} ${sessionSlotLabel}에 ${opponent?.name ?? '상대'}님과 1대1로 시작해요.`
            : '이제 실제 러닝 기록이 실시간으로 반영되고 있어요.',
        estimatedWaitMinutes: 0,
        participantCount: session.participants.length,
        acceptedCount: 0,
        capacity,
        userAccepted: true,
        readyToStart,
        ...(currentUserLiveSnapshot?.liveStatus ? { currentUserLiveStatus: currentUserLiveSnapshot.liveStatus } : {}),
        ...(currentUserLiveSnapshot?.disqualified === true ? { currentUserDisqualified: true } : {}),
        ...(myFinishElapsedSeconds !== null ? { currentUserFinishElapsedSeconds: myFinishElapsedSeconds } : {}),
        canCancel: state === 'matched' ? canCancelReservation : false,
        cancelableUntilAt,
        ...(countdownRemainingSeconds !== undefined ? {
          countdownRemainingSeconds,
          countdownEndsAt: session.slotStartAt,
        } : {}),
        ...(opponent ? { opponent } : {}),
        ...(officialComparison ? { officialComparison } : {}),
        ...(duelVerdict ? { duelVerdict } : {}),
      };
    }

    const participants = buildSessionGroupParticipants(store, session, now, officialStandings);
    const mySeedRank = participants.find((participant) => participant.id === currentUser.id)?.seedRank ?? 1;
    // The group verdict is the server-authoritative FINAL placement — the parity twin of
    // duelVerdict. Separate from the live `participants` standings above (which keep showing
    // live progress); this is only the sealed final ordering, additive/optional so an older
    // client ignores it. When unresolved (resolved=false), the client holds a PENDING result.
    const groupVerdict = buildGroupVerdict(session, officialStandings, currentUser.id, now);

      return {
        success: true,
        serverNow: now.toISOString(),
        mode,
        state,
        ...(isTestMatch ? { isTestMatch: true } : {}),
        matchId: session.id,
        distanceKm: session.distanceKm,
        slotStartAt: session.slotStartAt,
        slotLabel: sessionSlotLabel,
        paceBandLabel,
        levelBandLabel,
        criteriaSummary: isTestMatch
          ? state === 'matched'
            ? `테스트 그룹 ${participants.length}명이 모였어요. 30초 카운트다운이 끝나면 바로 시작돼요.`
            : '테스트 그룹 대결이 시작됐어요. 트랙에서 순위를 바로 확인할 수 있어요.'
          : state === 'matched'
            ? readyToStart
              ? `그룹 매칭이 잡혔어요. ${buildMatchSlotDateLabel(session.slotStartAt)} ${sessionSlotLabel} 대결을 이제 시작할 수 있어요.`
              : `그룹 매칭이 잡혔어요. ${buildMatchSlotDateLabel(session.slotStartAt)} ${sessionSlotLabel}에 ${participants.length}명 대결이 열려요.`
            : '이제 그룹 러닝 기록이 실시간으로 반영되고 있어요.',
        estimatedWaitMinutes: 0,
        participantCount: session.participants.length,
        acceptedCount: 0,
        capacity,
        userAccepted: true,
        readyToStart,
        ...(currentUserLiveSnapshot?.liveStatus ? { currentUserLiveStatus: currentUserLiveSnapshot.liveStatus } : {}),
        ...(currentUserLiveSnapshot?.disqualified === true ? { currentUserDisqualified: true } : {}),
        canCancel: state === 'matched' ? canCancelReservation : false,
        cancelableUntilAt,
        ...(countdownRemainingSeconds !== undefined ? {
          countdownRemainingSeconds,
          countdownEndsAt: session.slotStartAt,
        } : {}),
        participants,
        mySeedRank,
        ...(officialComparison ? { officialComparison } : {}),
        ...(groupVerdict ? { groupVerdict } : {}),
      };
  }

  const queuedEntries = buildQueuedMatchRunnerEntries(store, mode, currentRunner, {
    distanceKm,
    slotStartAt,
    includeCurrentUser: true,
    testMode,
  });
  const queuedParticipants = queuedEntries.map((entry) => entry.runner);
  const competitiveThreshold = mode === 'duel' ? DUEL_MIN_COMPATIBILITY_SCORE : GROUP_MIN_COMPATIBILITY_SCORE;
  const competitiveParticipantsCount = testMode
    ? queuedEntries.length
    : queuedEntries.filter((entry) => (
      entry.runner.id === currentRunner.id || entry.score >= competitiveThreshold
    )).length;
  const currentQueueEntry = queuedEntries.find((entry) => entry.runner.id === currentRunner.id)?.queueEntry ?? null;
  const averagePaceMinutes = queuedParticipants.length
    ? queuedParticipants.reduce((sum, runner) => sum + runner.averagePaceMinutes, 0) / queuedParticipants.length
    : null;
  const averagePace = averagePaceMinutes === null ? '신청 없음' : formatPaceMinutesLabel(averagePaceMinutes);
  const participants = mode === 'group' ? buildQueuedParticipants(queuedEntries) : undefined;
  const mySeedRank = participants?.find((participant) => participant.id === currentUser.id)?.seedRank ?? 1;
  const queueExpiresAt = currentQueueEntry
    ? getMatchQueueEntryExpiresAt(currentQueueEntry)
    : null;

  if (currentQueueEntry?.testMode) {
    return {
      success: true,
      serverNow: now.toISOString(),
      mode,
      state: 'waiting',
      isTestMatch: true,
      distanceKm: normalizeMatchQueueDistance(distanceKm),
      slotStartAt: currentQueueEntry.slotStartAt,
      slotLabel: formatDuelSlotLabelFromDateTime(currentQueueEntry.slotStartAt),
      paceBandLabel: averagePaceMinutes === null ? paceBandLabel : buildPaceBandLabel(averagePaceMinutes),
      levelBandLabel,
      criteriaSummary: mode === 'duel'
        ? `테스트 상대를 찾는 중이에요. 다른 러너가 들어오면 수준 상관없이 바로 30초 카운트다운이 시작되고, 최대 30분 동안 계속 매칭돼요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
        : `테스트 그룹을 찾는 중이에요. ${MATCH_TEST_GROUP_MIN_PARTICIPANTS}명만 모이면 수준 상관없이 바로 30초 카운트다운이 시작되고, 최대 30분 동안 계속 매칭돼요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
      estimatedWaitMinutes: queueExpiresAt
        ? Math.max(1, Math.ceil((new Date(queueExpiresAt).getTime() - now.getTime()) / (60 * 1000)))
        : 30,
      participantCount: queuedEntries.length,
      competitiveParticipantsCount,
      acceptedCount: 0,
      capacity,
      userAccepted: false,
      readyToStart: false,
      ...(queueExpiresAt ? buildExpirySnapshot(queueExpiresAt, now) : {}),
      ...(mode === 'duel' ? {
        opponent: undefined,
      } : {
        participants,
        mySeedRank,
      }),
      averagePace,
    };
  }

  return {
    success: true,
    serverNow: now.toISOString(),
    mode,
    state: currentQueueEntry ? 'waiting' : 'idle',
    distanceKm: normalizeMatchQueueDistance(distanceKm),
    slotStartAt,
    slotLabel: formatDuelSlotLabelFromDateTime(slotStartAt),
    paceBandLabel: averagePaceMinutes === null ? paceBandLabel : buildPaceBandLabel(averagePaceMinutes),
    levelBandLabel,
    criteriaSummary: mode === 'duel'
      ? queuedEntries.length
        ? `현재 같은 조건 대기 러너는 ${queuedEntries.length}/${capacity}명이에요. 출발 30분 전까지 잘 맞는 상대를 계속 찾고 있어요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
        : `아직 이 조건으로 대기 중인 러너가 없어요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
      : queuedEntries.length
        ? `현재 실제 대기열은 ${queuedEntries.length}/${capacity}명이고, 비슷한 러너는 ${competitiveParticipantsCount}/${capacity}명이에요.${competitiveParticipantsCount < GROUP_MIN_PARTICIPANTS ? ` 최소 ${GROUP_MIN_PARTICIPANTS}명은 모여야 시작해요.` : ''} 출발 30분 전까지 자동으로 계속 맞춰봐요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
        : `아직 이 조건으로 대기 중인 그룹이 없어요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
    estimatedWaitMinutes: Math.max(1, Math.ceil((new Date(slotStartAt).getTime() - MATCH_BOOKING_CUTOFF_MS - now.getTime()) / (60 * 1000))),
    participantCount: queuedEntries.length,
    competitiveParticipantsCount,
    acceptedCount: 0,
    capacity,
    userAccepted: false,
    readyToStart: false,
    ...(queueExpiresAt ? buildExpirySnapshot(queueExpiresAt, now) : {}),
    ...(mode === 'duel' ? {
      opponent: undefined,
    } : {
      participants,
      mySeedRank,
    }),
    averagePace,
  };
}
