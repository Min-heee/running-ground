import {
  DUEL_MIN_COMPATIBILITY_SCORE,
  DUEL_PACE_MATCH_TOLERANCE_SECONDS,
  GROUP_MIN_COMPATIBILITY_SCORE,
  GROUP_MIN_PARTICIPANTS,
  GROUP_PACE_MATCH_TOLERANCE_SECONDS,
} from '../matchConstants.mjs';
import {
  buildLevelLabel,
  buildPaceBandLabel,
  formatPaceMinutesLabel,
} from '../matchFormatting.mjs';
import {
  buildDistanceRecommendationHint,
  buildQueuedParticipants,
  getRunnerPaceGapSeconds,
} from '../matchPureHelpers.mjs';
import {
  buildMatchSlotDateLabel,
  formatDuelSlotLabel as formatDuelSlotLabelFromDateTime,
} from '../dateTimeFormatting.mjs';
import {
  removeUsersFromMatchQueue,
  upsertMatchQueueEntry,
} from '../matchQueueStoreHelpers.mjs';
import { nextId } from '../idHelpers.mjs';
import { validateMatchSlotStartAt } from '../matchSlotValidation.mjs';
import {
  addParticipantToMatchSession,
  buildMatchRunnerProfile,
  createMatchSession,
  findJoinableGroupSession,
} from '../runningMatchSessionStoreHelpers.mjs';
import { assertUserCanRequestAnotherMatch } from '../matchRoomStoreHelpers.mjs';
import {
  buildQueuedMatchRunnerEntries,
  buildSessionGroupParticipants,
} from './matchResponseParticipants.mjs';
import {
  buildTestDuelMatchResponse,
  buildTestGroupMatchResponse,
  clearUserTestMatchArtifacts,
} from './matchTestResponses.mjs';

export function buildDuelMatchResponse(store, currentUser, { distanceKm, slotStartAt, testMode = false }) {
  if (testMode) {
    clearUserTestMatchArtifacts(store, currentUser.id);
    assertUserCanRequestAnotherMatch(store, currentUser);
    return buildTestDuelMatchResponse(store, currentUser, { distanceKm, slotStartAt });
  }

  assertUserCanRequestAnotherMatch(store, currentUser);

  const normalizedSlotStartAt = validateMatchSlotStartAt(slotStartAt);
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const slotLabel = formatDuelSlotLabelFromDateTime(normalizedSlotStartAt);
  const paceBandLabel = buildPaceBandLabel(currentRunner.averagePaceMinutes);
  const levelBandLabel = `${buildLevelLabel(currentRunner.distanceLevel)} 전후`;
  const distanceRecommendationHint = buildDistanceRecommendationHint(distanceKm);

  upsertMatchQueueEntry(store, 'duel', currentUser.id, distanceKm, normalizedSlotStartAt);
  // Matching is pace-only. A candidate is eligible ONLY when the two runners'
  // average paces are within ±DUEL_PACE_MATCH_TOLERANCE_SECONDS (15s/km). Among
  // eligible candidates we pick the smallest pace gap (closest pace). The
  // queue-store already enforces the same-slot + SAME-distance (exact) filters,
  // so two similar-pace runners on the same slot/distance ALWAYS pair.
  const queuedEntries = buildQueuedMatchRunnerEntries(store, 'duel', currentRunner, {
    distanceKm,
    slotStartAt: normalizedSlotStartAt,
  }).map((entry) => ({
    ...entry,
    paceGapSeconds: getRunnerPaceGapSeconds(currentRunner, entry.runner),
  }));

  if (!queuedEntries.length) {
    return {
      success: true,
      matched: false,
      requestId: nextId('duel-request'),
      distanceKm,
      slotStartAt: normalizedSlotStartAt,
      slotLabel,
      paceBandLabel,
      levelBandLabel,
      criteriaSummary: `나와 비슷한 페이스를 가진 상대를 계속 찾고 있어요. 출발 30분 전까지만 매칭돼요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
      estimatedWaitMinutes: 15,
    };
  }

  const eligibleCandidates = queuedEntries
    .filter((entry) => entry.paceGapSeconds <= DUEL_PACE_MATCH_TOLERANCE_SECONDS)
    .sort((left, right) => left.paceGapSeconds - right.paceGapSeconds);
  const bestCandidate = eligibleCandidates[0];

  if (!bestCandidate) {
    return {
      success: true,
      matched: false,
      requestId: nextId('duel-request'),
      distanceKm,
      slotStartAt: normalizedSlotStartAt,
      slotLabel,
      paceBandLabel,
      levelBandLabel,
      criteriaSummary: `신청자는 있지만 아직 페이스가 비슷한 상대가 없어요. 출발 30분 전까지 계속 찾아볼게요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
      estimatedWaitMinutes: 10,
    };
  }

  removeUsersFromMatchQueue(store, 'duel', [currentUser.id, bestCandidate.runner.id]);
  createMatchSession(store, 'duel', distanceKm, normalizedSlotStartAt, [
    { id: currentUser.id, seedRank: 1 },
    { id: bestCandidate.runner.id, seedRank: 2 },
  ]);

  const opponent = bestCandidate.runner;
  return {
    success: true,
    matched: true,
    requestId: nextId('duel-request'),
    distanceKm,
    slotStartAt: normalizedSlotStartAt,
    slotLabel,
    paceBandLabel,
    levelBandLabel,
    criteriaSummary: `${buildMatchSlotDateLabel(normalizedSlotStartAt)} ${slotLabel}에 비슷한 페이스 상대와 매칭이 잡혔어요.`,
    estimatedWaitMinutes: 0,
    opponent: {
      id: opponent.id,
      name: opponent.name,
      tag: opponent.tag,
      districtName: opponent.districtName,
      averagePace: opponent.averagePace,
      levelLabel: opponent.levelLabel,
      weeklyDistanceKm: opponent.weeklyDistanceKm,
      lifetimeDistanceKm: opponent.lifetimeDistanceKm,
      compatibilitySummary: `${opponent.averagePace} 페이스 · ${opponent.levelLabel} · 이번 주 ${opponent.weeklyDistanceKm.toFixed(1)}km · 적합도 ${bestCandidate.score.toFixed(0)}점`,
    },
  };
}

// From queued group entries (each {queueEntry, runner}), find the tightest window of
// GROUP_MIN_PARTICIPANTS consecutive paces (when sorted by averagePaceMinutes) that
// INCLUDES self and whose spread (max−min) is within
// ±GROUP_PACE_MATCH_TOLERANCE_SECONDS. Returns the chosen entries (still in any order)
// or null when no such cluster exists. Ties on spread prefer the earliest window.
function selectGroupPaceCluster(entries, selfId, clusterSize = GROUP_MIN_PARTICIPANTS) {
  if (entries.length < clusterSize) {
    return null;
  }

  const sorted = [...entries].sort((left, right) => (
    left.runner.averagePaceMinutes - right.runner.averagePaceMinutes
  ));

  let best = null;

  for (let start = 0; start + clusterSize <= sorted.length; start += 1) {
    const window = sorted.slice(start, start + clusterSize);

    if (!window.some((entry) => entry.runner.id === selfId)) {
      continue;
    }

    // The window is already sorted by pace, so min/max are the ends.
    const spreadSeconds = (window[clusterSize - 1].runner.averagePaceMinutes - window[0].runner.averagePaceMinutes) * 60;

    if (spreadSeconds > GROUP_PACE_MATCH_TOLERANCE_SECONDS) {
      continue;
    }

    if (!best || spreadSeconds < best.spreadSeconds) {
      best = { window, spreadSeconds };
    }
  }

  return best ? best.window : null;
}

export function buildGroupMatchResponse(store, currentUser, { distanceKm, slotStartAt, testMode = false }) {
  if (testMode) {
    clearUserTestMatchArtifacts(store, currentUser.id);
    assertUserCanRequestAnotherMatch(store, currentUser);
    return buildTestGroupMatchResponse(store, currentUser, { distanceKm, slotStartAt });
  }

  assertUserCanRequestAnotherMatch(store, currentUser);

  const maxGroupSize = 30;
  const normalizedSlotStartAt = validateMatchSlotStartAt(slotStartAt);
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const slotLabel = formatDuelSlotLabelFromDateTime(normalizedSlotStartAt);
  const paceBandLabel = buildPaceBandLabel(currentRunner.averagePaceMinutes);
  const levelBandLabel = `${buildLevelLabel(currentRunner.distanceLevel)} 전후`;
  const distanceRecommendationHint = buildDistanceRecommendationHint(distanceKm);

  upsertMatchQueueEntry(store, 'group', currentUser.id, distanceKm, normalizedSlotStartAt);

  // LATE-JOINER: a group of 3 has already formed and anchored. If THIS requester is
  // within ±15s of an existing forming group's anchor, slot them in as the single
  // open seat for this HTTP call (closest-first one-at-a-time — only one joiner per
  // call) and return matched immediately.
  const joinableSession = findJoinableGroupSession(store, {
    distanceKm,
    slotStartAt: normalizedSlotStartAt,
    joinerPaceMinutes: currentRunner.averagePaceMinutes,
  });

  if (joinableSession) {
    addParticipantToMatchSession(store, joinableSession, {
      id: currentRunner.id,
      seedRank: joinableSession.participants.length + 1,
    });
    removeUsersFromMatchQueue(store, 'group', [currentRunner.id]);
    const participants = buildSessionGroupParticipants(store, joinableSession);
    const mySeedRank = participants.find((participant) => participant.id === currentRunner.id)?.seedRank ?? participants.length;

    return {
      success: true,
      matched: true,
      requestId: nextId('group-request'),
      distanceKm,
      slotStartAt: normalizedSlotStartAt,
      slotLabel,
      paceBandLabel,
      levelBandLabel,
      criteriaSummary: `${buildMatchSlotDateLabel(normalizedSlotStartAt)} ${slotLabel}에 이미 모인 ${participants.length}명 그룹에 합류했어요.`,
      estimatedWaitMinutes: 0,
      maxGroupSize,
      participantsCount: participants.length,
      mySeedRank,
      participants,
    };
  }

  // FORM-AT-3: from the same-slot + SAME-distance (exact) queued entries, pick the
  // tightest cluster of 3 paces (all within ±15s of each other) that includes self.
  const queuedEntries = buildQueuedMatchRunnerEntries(store, 'group', currentRunner, {
    distanceKm,
    slotStartAt: normalizedSlotStartAt,
    includeCurrentUser: true,
  });
  const cluster = selectGroupPaceCluster(queuedEntries, currentRunner.id, GROUP_MIN_PARTICIPANTS);

  if (!cluster) {
    // Not enough same-pace runners yet — keep the requester queued and wait. The
    // displayed participants mirror the queued runners (sorted) so the caller still
    // sees who is waiting.
    const waitingParticipants = buildQueuedParticipants(queuedEntries.slice(0, maxGroupSize));
    const waitingSeedRank = waitingParticipants.find((participant) => participant.id === currentRunner.id)?.seedRank ?? 1;

    return {
      success: true,
      matched: false,
      requestId: nextId('group-request'),
      distanceKm,
      slotStartAt: normalizedSlotStartAt,
      slotLabel,
      paceBandLabel,
      levelBandLabel,
      criteriaSummary: `나와 ±${GROUP_PACE_MATCH_TOLERANCE_SECONDS}초 이내 페이스 러너를 계속 모으는 중이에요. 최소 ${GROUP_MIN_PARTICIPANTS}명은 모여야 하고, 출발 30분 전까지만 매칭돼요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
      estimatedWaitMinutes: 10,
      maxGroupSize,
      participantsCount: waitingParticipants.length,
      mySeedRank: waitingSeedRank,
      participants: waitingParticipants,
    };
  }

  // The anchor is the AVERAGE pace of the founding 3. Members are ordered closest-pace-
  // first and seeded by closeness to that anchor (so seedRank 1 is the runner nearest
  // the group's average pace).
  const anchorPaceMinutes = cluster.reduce((sum, entry) => sum + entry.runner.averagePaceMinutes, 0) / cluster.length;
  const orderedMembers = [...cluster].sort((left, right) => {
    const leftGap = Math.abs(left.runner.averagePaceMinutes - anchorPaceMinutes);
    const rightGap = Math.abs(right.runner.averagePaceMinutes - anchorPaceMinutes);

    if (leftGap !== rightGap) {
      return leftGap - rightGap;
    }

    // Deterministic tie-break: earlier queue request first.
    return new Date(left.queueEntry.requestedAt).getTime() - new Date(right.queueEntry.requestedAt).getTime();
  });
  const participantSeeds = orderedMembers.map((entry, index) => ({
    id: entry.runner.id,
    seedRank: index + 1,
  }));

  removeUsersFromMatchQueue(store, 'group', participantSeeds.map((participant) => participant.id));
  const session = createMatchSession(store, 'group', distanceKm, normalizedSlotStartAt, participantSeeds, {
    anchorPaceMinutes,
  });
  const participants = buildSessionGroupParticipants(store, session);
  const mySeedRank = participants.find((participant) => participant.id === currentRunner.id)?.seedRank ?? 1;

  return {
    success: true,
    matched: true,
    requestId: nextId('group-request'),
    distanceKm,
    slotStartAt: normalizedSlotStartAt,
    slotLabel,
    paceBandLabel,
    levelBandLabel,
    criteriaSummary: `${buildMatchSlotDateLabel(normalizedSlotStartAt)} ${slotLabel}에 ${participants.length}명 그룹 대결이 잡혔어요.`,
    estimatedWaitMinutes: 0,
    maxGroupSize,
    participantsCount: participants.length,
    mySeedRank,
    participants,
  };
}

export function buildMatchDemandSummaryResponse(store, currentUser, { mode, distanceKm, slotStartAt }) {
  const normalizedSlotStartAt = validateMatchSlotStartAt(slotStartAt);
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const capacity = mode === 'duel' ? 2 : 30;
  const competitiveThreshold = mode === 'duel' ? DUEL_MIN_COMPATIBILITY_SCORE : GROUP_MIN_COMPATIBILITY_SCORE;
  const queuedEntries = buildQueuedMatchRunnerEntries(store, mode, currentRunner, {
    distanceKm,
    slotStartAt: normalizedSlotStartAt,
    includeCurrentUser: true,
  });
  const queuedParticipants = queuedEntries.map((entry) => entry.runner);
  const competitiveParticipantsCount = queuedEntries
    .filter((entry) => entry.runner.id === currentRunner.id || entry.score >= competitiveThreshold)
    .length;
  const participantsCount = queuedEntries.length;
  const averagePaceMinutes = queuedParticipants.length
    ? queuedParticipants.reduce((sum, runner) => sum + runner.averagePaceMinutes, 0) / queuedParticipants.length
    : null;
  const distanceRecommendationHint = buildDistanceRecommendationHint(distanceKm);
  const averagePace = averagePaceMinutes === null ? '신청 없음' : formatPaceMinutesLabel(averagePaceMinutes);

  return {
    success: true,
    mode,
    distanceKm,
    slotStartAt: normalizedSlotStartAt,
    slotLabel: formatDuelSlotLabelFromDateTime(normalizedSlotStartAt),
    averagePace,
    participantsCount,
    competitiveParticipantsCount,
    capacity,
    // Duel keeps the N/2 fraction (a duel literally needs exactly 2). Group shows a plain
    // searcher COUNT: the 30 cap is an upper bound on one session, not a quota to fill —
    // "0/30" read as "30 people required", which is exactly backwards for a 3-to-start mode.
    fillRatioLabel: mode === 'duel'
      ? `${participantsCount}/${capacity}`
      : `${participantsCount}명 찾는 중`,
    paceBandLabel: averagePaceMinutes === null ? '대기 없음' : buildPaceBandLabel(averagePaceMinutes),
    summaryText: mode === 'duel'
      ? participantsCount
        ? `현재 실제 신청은 ${participantsCount}/${capacity}명이고, 바로 붙일 만한 러너는 ${competitiveParticipantsCount}/${capacity}명이에요. 출발 30분 전까지 자동으로 계속 맞춰봐요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
        : `아직 이 시간대 신청이 없어요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
      : participantsCount
        ? `지금 ${participantsCount}명이 이 시간대 그룹을 찾고 있고, 비슷한 페이스 러너는 ${competitiveParticipantsCount}명이에요.${competitiveParticipantsCount < GROUP_MIN_PARTICIPANTS ? ` 최소 ${GROUP_MIN_PARTICIPANTS}명은 모여야 시작해요.` : ''} 출발 30분 전까지 자동으로 계속 맞춰봐요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
        : `아직 이 시간대 신청이 없어요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
  };
}
