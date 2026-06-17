import {
  MATCH_PARTICIPANT_BACKGROUND_STALE_MS,
  MATCH_PARTICIPANT_RUNNING_STALE_MS,
  MATCH_ROOM_GROUP_DEFAULT_PARTICIPANTS,
  MATCH_ROOM_GROUP_MAX_PARTICIPANTS,
  MATCH_ROOM_GROUP_MIN_PARTICIPANTS,
  MATCH_ROOM_INVITE_LINK_BASE,
  RECOMMENDED_MATCH_DISTANCES,
} from './matchConstants.mjs';

export function calculateMatchCompatibilityScore(currentRunner, candidate, distanceKm, mode) {
  const paceGapSeconds = Math.abs(candidate.averagePaceMinutes - currentRunner.averagePaceMinutes) * 60;
  const levelGap = Math.abs(candidate.distanceLevel - currentRunner.distanceLevel);
  const distanceGap = Math.abs(candidate.latestDistanceKm - distanceKm);
  const weeklyGap = Math.abs(candidate.weeklyDistanceKm - currentRunner.weeklyDistanceKm);
  const penalty = paceGapSeconds * (mode === 'duel' ? 0.22 : 0.16)
    + levelGap * (mode === 'duel' ? 8 : 6.5)
    + distanceGap * (mode === 'duel' ? 2.8 : 2.2)
    + weeklyGap * (mode === 'duel' ? 0.8 : 0.55);

  return Math.max(0, Math.min(100, Number((100 - penalty).toFixed(1))));
}

export function isRecommendedMatchDistance(distanceKm) {
  return RECOMMENDED_MATCH_DISTANCES.some((recommendedDistanceKm) => Math.abs(recommendedDistanceKm - distanceKm) < 0.15);
}

export function findNearestRecommendedDistance(distanceKm) {
  return RECOMMENDED_MATCH_DISTANCES.reduce((closestDistanceKm, candidateDistanceKm) => (
    Math.abs(candidateDistanceKm - distanceKm) < Math.abs(closestDistanceKm - distanceKm)
      ? candidateDistanceKm
      : closestDistanceKm
  ));
}

export function buildDistanceRecommendationHint(distanceKm) {
  if (isRecommendedMatchDistance(distanceKm)) {
    return '';
  }

  return `추천 거리 ${findNearestRecommendedDistance(distanceKm)}km로 바꾸면 더 빨리 비슷한 러너가 모일 수 있어요.`;
}

export function normalizeMatchQueueDistance(distanceKm) {
  return Number(distanceKm.toFixed(1));
}

export function normalizeMatchRoomMaxParticipants(mode, value) {
  if (mode === 'duel') {
    return 2;
  }

  const parsedValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsedValue)) {
    return MATCH_ROOM_GROUP_DEFAULT_PARTICIPANTS;
  }

  // Safety net: a group room must never be capped below the group minimum, so a
  // stale duel value of 2 leaking from the client cannot create a 2-person "group".
  return Math.max(
    MATCH_ROOM_GROUP_MIN_PARTICIPANTS,
    Math.min(MATCH_ROOM_GROUP_MAX_PARTICIPANTS, Math.round(parsedValue)),
  );
}

export function getMatchRoomMinParticipants(mode) {
  return mode === 'duel' ? 2 : MATCH_ROOM_GROUP_MIN_PARTICIPANTS;
}

export function isMatchRoomVisibleToUser(room, userId) {
  return room.hostUserId === userId
    || room.participants.some((participant) => participant.userId === userId)
    || (Array.isArray(room.invitedFriendIds) && room.invitedFriendIds.includes(userId));
}

export function buildMatchRoomInviteLink(inviteToken) {
  return `${MATCH_ROOM_INVITE_LINK_BASE}?roomInviteToken=${inviteToken}`;
}

export function areAllRunningMatchRoomGuestsReady(room) {
  if (!room) {
    return false;
  }

  const guests = room.participants.filter((participant) => !participant.isHost);
  if (!guests.length) {
    return false;
  }

  return guests.every((participant) => participant.isReady);
}

export function areAllRunningMatchRoomParticipantsCountdownReady(room) {
  if (!room) {
    return false;
  }

  if (!room.participants.length) {
    return false;
  }

  return room.participants.every((participant) => participant.isCountdownReady);
}

export function shouldClearLiveRunShareEntry(entry, now = new Date()) {
  if (!entry || typeof entry !== 'object') {
    return false;
  }

  const status = String(entry.status ?? 'idle');
  const updatedAtMs = new Date(entry.updatedAt ?? entry.lastUpdatedAt ?? entry.createdAt ?? 0).getTime();
  const isPotentiallyActive = ['running', 'background'].includes(status);

  if (!isPotentiallyActive) {
    return true;
  }

  return !Number.isFinite(updatedAtMs) || updatedAtMs + MATCH_PARTICIPANT_BACKGROUND_STALE_MS <= now.getTime();
}

export function resolveParticipantLiveStatus(participant, now = new Date()) {
  if (typeof participant.finishedAt === 'string' && participant.finishedAt) {
    return 'finished';
  }

  const storedStatus = typeof participant.liveStatus === 'string' && participant.liveStatus
    ? participant.liveStatus
    : 'ready';

  if (!participant.liveUpdatedAt || ['ready', 'finished', 'forfeited'].includes(storedStatus)) {
    return storedStatus;
  }

  const liveUpdatedAtMs = new Date(participant.liveUpdatedAt).getTime();
  if (!Number.isFinite(liveUpdatedAtMs)) {
    return storedStatus;
  }

  const ageMs = now.getTime() - liveUpdatedAtMs;
  if (storedStatus === 'running' && ageMs > MATCH_PARTICIPANT_RUNNING_STALE_MS) {
    return 'disconnected';
  }

  if (['background', 'paused'].includes(storedStatus) && ageMs > MATCH_PARTICIPANT_BACKGROUND_STALE_MS) {
    return 'disconnected';
  }

  return storedStatus;
}

export function isParticipantDoneWithMatch(participant, now = new Date()) {
  return ['finished', 'forfeited'].includes(resolveParticipantLiveStatus(participant, now));
}

export function projectOfficialDistanceKm(distanceKm, elapsedSeconds, officialElapsedSeconds, targetDistanceKm) {
  if (!Number.isFinite(distanceKm) || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return 0;
  }

  const safeOfficialElapsedSeconds = Math.max(0, Math.min(officialElapsedSeconds, elapsedSeconds));
  const projectedDistanceKm = (distanceKm * safeOfficialElapsedSeconds) / elapsedSeconds;
  return Number(Math.max(0, Math.min(targetDistanceKm, projectedDistanceKm)).toFixed(2));
}

export function buildOfficialStandingFields(standing) {
  if (!standing) {
    return {};
  }

  return {
    officialDistanceKm: standing.officialDistanceKm,
    officialElapsedSeconds: standing.officialElapsedSeconds,
    officialAveragePace: standing.officialAveragePace,
    officialRank: standing.officialRank,
    officialGapAheadKm: standing.officialGapAheadKm,
    officialGapLeaderKm: standing.officialGapLeaderKm,
    officialComparedAt: standing.officialComparedAt,
    officialReady: standing.officialReady,
    // F3: surface the frozen MEASURED finish elapsed (the duel rank key) onto every
    // standings projection so the response contract's promise that each standing carries
    // finishElapsedSeconds is met. Additive/optional — older clients ignore it. The
    // standing already carries finishElapsedSeconds from buildOfficialSessionStandings.
    finishElapsedSeconds: standing.finishElapsedSeconds ?? null,
  };
}

export function buildOfficialComparisonSummary(standings, currentUserId) {
  const currentStanding = standings.find((standing) => standing.userId === currentUserId);
  const leader = standings[0] ?? null;

  if (!currentStanding || !leader) {
    return null;
  }

  return {
    comparedAt: currentStanding.officialComparedAt,
    elapsedSeconds: currentStanding.officialElapsedSeconds,
    participantCount: standings.length,
    readyParticipantCount: standings.filter((standing) => standing.officialReady).length,
    userRank: currentStanding.officialReady ? currentStanding.officialRank : undefined,
    userDistanceKm: currentStanding.officialReady ? currentStanding.officialDistanceKm : undefined,
    userAveragePace: currentStanding.officialReady ? currentStanding.officialAveragePace : undefined,
    leaderUserId: leader.officialReady ? leader.userId : undefined,
    leaderName: leader.officialReady ? leader.name : undefined,
    leaderDistanceKm: leader.officialReady ? leader.officialDistanceKm : undefined,
    leaderAveragePace: leader.officialReady ? leader.officialAveragePace : undefined,
    gapAheadKm: currentStanding.officialReady ? currentStanding.officialGapAheadKm : undefined,
    gapLeaderKm: currentStanding.officialReady ? currentStanding.officialGapLeaderKm : undefined,
  };
}

export function buildQueuedParticipants(entries) {
  return entries
    .map((entry) => entry.runner)
    .sort((left, right) => {
      const leftSeed = left.averagePaceMinutes * 60 * 0.7 - left.weeklyDistanceKm * 1.8 - left.lifetimeDistanceKm * 0.03;
      const rightSeed = right.averagePaceMinutes * 60 * 0.7 - right.weeklyDistanceKm * 1.8 - right.lifetimeDistanceKm * 0.03;
      return leftSeed - rightSeed;
    })
    .map((participant, index) => ({
      id: participant.id,
      name: participant.name,
      tag: participant.tag,
      districtName: participant.districtName,
      averagePace: participant.averagePace,
      levelLabel: participant.levelLabel,
      weeklyDistanceKm: participant.weeklyDistanceKm,
      lifetimeDistanceKm: participant.lifetimeDistanceKm,
      seedRank: index + 1,
      seedSummary: `${index + 1}번 시드 · 이번 주 ${participant.weeklyDistanceKm.toFixed(1)}km`,
    }));
}
