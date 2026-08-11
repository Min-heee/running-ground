import {
  GROUP_MATCH_MAX_PARTICIPANTS,
  GROUP_PACE_MATCH_TOLERANCE_SECONDS,
  MATCH_SESSION_ALL_DONE_RETENTION_MS,
} from '../matchConstants.mjs';
import {
  isParticipantDoneWithMatch,
  isSameMatchDistance,
  normalizeMatchQueueDistance,
} from '../matchPureHelpers.mjs';
import { nextId } from '../idHelpers.mjs';
import { isTestMatchSession } from '../matchScheduleHelpers.mjs';
import {
  ensureMatchSessions,
  hydrateMatchSessionState,
} from './matchSessionCore.mjs';
import { sweepStuckMatchSessionFallbacks } from './matchSessionFallbackSeals.mjs';
import { recordVanishedMatch } from '../vanishedMatchTombstones.mjs';
import {
  amendMatchRoster,
  pruneMatchRosters,
  recordMatchRoster,
} from '../matchRosters.mjs';

// Every session dropped from the store passes through here so a device still polling
// the vanished matchId gets a terminal 410 (match_gone) instead of retrying a 404
// forever. Cheap no-op when nothing was removed.
function recordPrunedSessions(previousSessions, keptSessions, now) {
  if (previousSessions.length === keptSessions.length) {
    return;
  }

  const keptIds = new Set(keptSessions.map((session) => session.id));

  for (const session of previousSessions) {
    if (session?.id && !keptIds.has(session.id)) {
      recordVanishedMatch(session.id, now);
    }
  }
}

// The moment the LAST participant became done — max over finishedAt/forfeitedAt (with
// liveUpdatedAt as a stamp of last contact) across all participants. 0 when nothing is
// parseable, which makes the retention window read as long-expired (legacy rows keep
// today's instant-drop behavior).
function resolveSessionLastDoneAtMs(session) {
  let lastDoneAtMs = 0;

  for (const participant of session.participants) {
    for (const candidate of [participant.finishedAt, participant.forfeitedAt, participant.liveUpdatedAt]) {
      const candidateMs = typeof candidate === 'string' && candidate ? Date.parse(candidate) : Number.NaN;

      if (Number.isFinite(candidateMs) && candidateMs > lastDoneAtMs) {
        lastDoneAtMs = candidateMs;
      }
    }
  }

  return lastDoneAtMs;
}

export function pruneMatchSessions(store, now = new Date()) {
  const sessions = ensureMatchSessions(store);
  const activeUserIds = new Set(store.users.map((user) => user.id));

  // Self-heal stuck one-finisher matches BEFORE pruning so a sealed-but-stranded session is
  // resolved + back-filled while it is still physically present. A sealed DNF runner stays a
  // non-finisher (not "done"), so a freshly-sealed one-finisher session is NOT dropped by the
  // filter below — it persists until both sides are terminal or it expires, exactly as before.
  sweepStuckMatchSessionFallbacks(store, now);

  const keptSessions = sessions.filter((session) => {
    if (!session || !Array.isArray(session.participants) || !session.participants.length) {
      return false;
    }

    if (session.participants.some((participant) => !participant.profileSnapshot && !activeUserIds.has(participant.userId))) {
      return false;
    }

    if (session.participants.every((participant) => isParticipantDoneWithMatch(participant, now))) {
      // POST-FINISH RETENTION — keep an all-done session for a window instead of dropping it
      // on the very next lookup. The instant-drop destroyed the slower finisher's own
      // 'finished' echo when their finish POST landed but the response timed out client-side:
      // their next status poll pruned the session and got the idle-no-matchId payload, which
      // the client contract reads as a vanished match (mid-run solo demotion, run saved
      // without its matchId — the 2026-07-09 incident). Sessions without any parseable done
      // timestamp fall out immediately, exactly as before.
      return now.getTime() - resolveSessionLastDoneAtMs(session) < MATCH_SESSION_ALL_DONE_RETENTION_MS;
    }

    return hydrateMatchSessionState(session, now) !== 'expired';
  });

  recordPrunedSessions(sessions, keptSessions, now);
  store.matchSessions = keptSessions;

  // 세션이 사라져도 참가자 명단은 남아야 한다 — 그게 세션 없는 분기의 유일한 서버 진실이다.
  // 여기서 도는 것은 로스터 컬렉션의 만료 정리(+ epoch 각인)뿐이고, 기록 자체는 세션 생성
  // 시점에 이미 끝나 있다. prune은 모든 쓰기 요청에서 도므로 GC와 epoch가 항상 살아있다.
  pruneMatchRosters(store, now);

  return store.matchSessions;
}

function clearUsersFromMatchSessions(store, mode, userIds, now = new Date()) {
  const blockedUserIds = new Set(userIds);
  const sessions = pruneMatchSessions(store, now);
  const keptSessions = sessions.filter((session) => (
    session.mode !== mode || !session.participants.some((participant) => (
      blockedUserIds.has(participant.userId) && !isParticipantDoneWithMatch(participant, now)
    ))
  ));

  recordPrunedSessions(sessions, keptSessions, now);
  store.matchSessions = keptSessions;
}

// Single source of truth for the per-participant session shape. addParticipantToMatchSession
// reuses it so a late joiner is byte-for-byte identical to a founding participant.
function buildSessionParticipant(participant, index) {
  return {
    userId: participant.id,
    seedRank: participant.seedRank ?? index + 1,
    ...(participant.profileSnapshot ? { profileSnapshot: participant.profileSnapshot } : {}),
    acceptedAt: null,
    liveStatus: 'ready',
    liveDistanceKm: 0,
    liveElapsedSeconds: 0,
    livePace: '--:--/km',
    liveUpdatedAt: null,
    finishedAt: null,
    finishElapsedSeconds: null,
    // CHECKPOINT-FAIR LIVE COMPARE — a compact, bounded parallel number[] where
    // checkpoints[k] = distanceKm (2dp) at grid time T=(k+1)*MATCH_CHECKPOINT_STEP_SECONDS,
    // k=floor(elapsedSeconds/STEP). Filled additively by the progress handler (Stage 1) and
    // read by buildOfficialSessionStandings (Stage 2) so the head-to-head compares both
    // runners at the latest COMMON checkpoint. Empty until the first running/background push.
    checkpoints: [],
  };
}

export function createMatchSession(store, mode, distanceKm, slotStartAt, participants, options = {}) {
  // 시계 주입 — 로스터 항목의 나이(만료 GC의 기준)와 세션 타임스탬프가 같은 시각을 봐야 하고,
  // 판정 경로 테스트가 결정적이려면 여기서 시간을 고정할 수 있어야 한다. 안 넘기면 기존과 동일.
  const now = options.now instanceof Date ? options.now : new Date();
  clearUsersFromMatchSessions(store, mode, participants.map((participant) => participant.id), now);
  const session = {
    id: nextId(`${mode}-match`),
    mode,
    isTestMatch: options.isTestMatch === true,
    isPartyRun: options.isPartyRun === true,
    distanceKm: normalizeMatchQueueDistance(distanceKm),
    slotStartAt,
    // The group anchor — the average pace of the founding 3 — is the gate every later
    // joiner is measured against (±GROUP_PACE_MATCH_TOLERANCE_SECONDS). Persisted at
    // creation; undefined for duels/test sessions where no anchor is supplied.
    ...(Number.isFinite(options.anchorPaceMinutes) ? { anchorPaceMinutes: options.anchorPaceMinutes } : {}),
    createdAt: now.toISOString(),
    matchedAt: now.toISOString(),
    participants: participants.map((participant, index) => buildSessionParticipant(participant, index)),
  };
  ensureMatchSessions(store).push(session);
  // 서버가 만든 참가자 명단을 세션과 분리해 박제한다 — 세션은 10분 뒤 사라지지만 정당한 늦은
  // 저장은 최대 7일 뒤에도 온다(클라 저장 대기열). 이 한 줄이 세션 없는 분기의 로스터 출처다.
  recordMatchRoster(store, session, now);
  return session;
}

// One-at-a-time late-join admission: push exactly one participant (the closest joiner
// the caller already selected) onto an existing forming group session, using the same
// shape createMatchSession produces. seedRank defaults to the next slot after the
// current participants.
// `store`를 받는 이유: 지각 합류자도 내구 로스터에 들어가야 한다. 세션에만 추가하면 세션이
// pruned된 뒤 그 참가자는 "로스터에 없는 사람"이 되어 자기 기록이 영영 PENDING으로 남는다.
export function addParticipantToMatchSession(store, session, participant) {
  const index = session.participants.length;
  session.participants.push(buildSessionParticipant(participant, index));
  amendMatchRoster(store, session.id, participant?.id);
  return session;
}

// Find an existing forming group session a joiner can slot into: same mode + SAME
// distance (exact after normalization) + same slot, still in the 'matched' (pre-start)
// state, under the size cap,
// and whose anchor pace is within ±GROUP_PACE_MATCH_TOLERANCE_SECONDS of the joiner.
// Returns the session or null. Caller adds exactly one joiner per HTTP call so the
// closest joiner wins the single open seat (closest-first, one at a time).
export function findJoinableGroupSession(store, { distanceKm, slotStartAt, joinerPaceMinutes, now = new Date() } = {}) {
  if (!Number.isFinite(joinerPaceMinutes)) {
    return null;
  }

  const normalizedDistanceKm = distanceKm === undefined || distanceKm === null
    ? null
    : normalizeMatchQueueDistance(distanceKm);
  const sessions = pruneMatchSessions(store, now);

  for (let index = sessions.length - 1; index >= 0; index -= 1) {
    const session = sessions[index];

    if (session.mode !== 'group' || isTestMatchSession(session)) {
      continue;
    }

    if (!Number.isFinite(session.anchorPaceMinutes)) {
      continue;
    }

    if (hydrateMatchSessionState(session, now) !== 'matched') {
      continue;
    }

    if (session.participants.length >= GROUP_MATCH_MAX_PARTICIPANTS) {
      continue;
    }

    // Same-distance ONLY (isSameMatchDistance): a 5.1km requester must never late-join
    // a 5.0km group — the old ±0.15 band allowed exactly that.
    if (normalizedDistanceKm !== null && !isSameMatchDistance(session.distanceKm, normalizedDistanceKm)) {
      continue;
    }

    if (slotStartAt && session.slotStartAt !== slotStartAt) {
      continue;
    }

    const anchorGapSeconds = Math.abs(joinerPaceMinutes - session.anchorPaceMinutes) * 60;

    if (anchorGapSeconds > GROUP_PACE_MATCH_TOLERANCE_SECONDS) {
      continue;
    }

    return session;
  }

  return null;
}

export function findMatchSessionById(store, matchId) {
  if (!matchId) {
    return null;
  }

  return pruneMatchSessions(store).find((session) => session.id === matchId) ?? null;
}

export function findMatchSessionForUser(store, mode, userId, { distanceKm, slotStartAt, testMode = false, matchId } = {}) {
  if (matchId) {
    const directSession = findMatchSessionById(store, matchId);

    if (!directSession || directSession.mode !== mode) {
      return null;
    }

    if (isTestMatchSession(directSession) !== testMode) {
      return null;
    }

    if (!directSession.participants.some((participant) => participant.userId === userId)) {
      return null;
    }

    return directSession;
  }

  const normalizedDistanceKm = distanceKm === undefined ? null : normalizeMatchQueueDistance(distanceKm);
  const sessions = pruneMatchSessions(store);

  for (let index = sessions.length - 1; index >= 0; index -= 1) {
    const session = sessions[index];
    if (session.mode !== mode) {
      continue;
    }

    if (isTestMatchSession(session) !== testMode) {
      continue;
    }

    if (!session.participants.some((participant) => (
      participant.userId === userId && !isParticipantDoneWithMatch(participant)
    ))) {
      continue;
    }

    if (normalizedDistanceKm !== null && Math.abs(session.distanceKm - normalizedDistanceKm) >= 0.15) {
      continue;
    }

    if (!testMode && slotStartAt && session.slotStartAt !== slotStartAt) {
      continue;
    }

    return session;
  }

  return null;
}

export function findAnyReservedMatchSessionForUser(store, userId, now = new Date()) {
  const sessions = pruneMatchSessions(store, now);

  for (const session of sessions) {
    const participant = session.participants.find((item) => (
      item.userId === userId && !isParticipantDoneWithMatch(item, now)
    ));

    if (!participant) {
      continue;
    }

    const state = hydrateMatchSessionState(session, now);

    if (['matched', 'active'].includes(state)) {
      return { session, state };
    }
  }

  return null;
}
