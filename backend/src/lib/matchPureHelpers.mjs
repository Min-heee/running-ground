import {
  MATCH_PARTICIPANT_BACKGROUND_STALE_MS,
  MATCH_PARTICIPANT_RUNNING_STALE_MS,
  MATCH_ROOM_GROUP_DEFAULT_PARTICIPANTS,
  MATCH_ROOM_GROUP_MAX_PARTICIPANTS,
  MATCH_ROOM_GROUP_MIN_PARTICIPANTS,
  MATCH_ROOM_INVITE_LINK_BASE,
  MATCH_ROOM_WAITING_TTL_MS,
  RECOMMENDED_MATCH_DISTANCES,
} from './matchConstants.mjs';

export function getRunnerPaceGapSeconds(currentRunner, candidate) {
  return Math.abs(candidate.averagePaceMinutes - currentRunner.averagePaceMinutes) * 60;
}

// Matching is pace-only: level (distanceLevel) no longer affects the score, so
// two similar-pace runners are not pushed below the match threshold by a level
// gap. The score remains usable for ranking candidates by closeness.
export function calculateMatchCompatibilityScore(currentRunner, candidate, distanceKm, mode) {
  const paceGapSeconds = getRunnerPaceGapSeconds(currentRunner, candidate);
  const distanceGap = Math.abs(candidate.latestDistanceKm - distanceKm);
  const weeklyGap = Math.abs(candidate.weeklyDistanceKm - currentRunner.weeklyDistanceKm);
  const penalty = paceGapSeconds * (mode === 'duel' ? 0.22 : 0.16)
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

// Matchmaking distance identity: two requests race together ONLY when they mean the SAME
// distance (5km with 5km, 10km with 10km). Queue entries and sessions both store
// normalizeMatchQueueDistance()d values (one decimal), so after normalizing both sides
// equality holds exactly; the 0.05 epsilon only absorbs float representation noise
// (42.195→42.2 vs a stored 42.2). It is deliberately SMALLER than the 0.1km custom-input
// step, so 5.0km and 5.1km — different user intents — can never be paired (the old ±0.15
// band wrongly allowed that: a 5.1km requester could land in a 5.0km race).
export function isSameMatchDistance(leftDistanceKm, rightDistanceKm) {
  return Math.abs(normalizeMatchQueueDistance(leftDistanceKm) - normalizeMatchQueueDistance(rightDistanceKm)) < 0.05;
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

// 대기방의 '마지막 활동' 시각 — 만료 판정의 기준점.
//
// updatedAt은 방 설정 변경에서만 찍히므로 그것만 보면 사람이 계속 들어오고 준비를 누르는
// 살아 있는 대기실도 생성 2시간이면 죽는다. 참가자 joinedAt까지 함께 보는 이유다(참가는
// 그 자체로 활동이고, 준비 토글은 updatedAt을 올린다). 폴링(/rooms/my)은 활동이 아니다 —
// 폴링마다 방을 쓰면 whole-store 블롭이 폴링 주기마다 통째로 재직렬화된다(#209).
export function getMatchRoomLastActivityAtMs(room) {
  const candidates = [
    Date.parse(room?.createdAt ?? ''),
    Date.parse(room?.updatedAt ?? ''),
    ...(Array.isArray(room?.participants)
      ? room.participants.map((participant) => Date.parse(participant?.joinedAt ?? ''))
      : []),
  ].filter((value) => Number.isFinite(value));

  return candidates.length ? Math.max(...candidates) : Number.NaN;
}

// 시작 전(연결된 대결 세션이 없는) 방장-시작 대기방이 수명을 넘겼는지. prune과 관리자 화면이
// 같은 판정을 쓰도록 여기 한 곳에만 둔다 — 둘이 갈라지면 앱에는 없는 방이 관리자 화면에만
// 남는 지금의 증상이 그대로 재발한다.
export function isWaitingMatchRoomExpired(room, now = new Date(), ttlMs = MATCH_ROOM_WAITING_TTL_MS) {
  if (!room || room.linkedMatchId || room.startMode === 'scheduled') {
    return false;
  }

  const lastActivityAtMs = getMatchRoomLastActivityAtMs(room);

  // 시각을 못 읽는 방(손상/구버전 레코드)은 만료로 본다 — 되살릴 근거가 없는 방이
  // 영원히 매칭을 막는 쪽이 더 나쁘다.
  return !Number.isFinite(lastActivityAtMs) || lastActivityAtMs + ttlMs <= now.getTime();
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
      seedSummary: `${index + 1}번 시드 · 이번 주 ${(participant.displayWeeklyDistanceKm ?? participant.weeklyDistanceKm).toFixed(1)}km`,
    }));
}
