import { ApiError } from '../response/httpResponse.mjs';
import { appendCheckpointSample } from './matchCheckpointHelpers.mjs';
import { MATCH_GOAL_DISTANCE_TOLERANCE_KM } from './matchConstants.mjs';
import {
  normalizeMatchQueueDistance,
  resolveParticipantLiveStatus,
} from './matchPureHelpers.mjs';
import {
  buildMatchCancellationDeadline,
  buildTestMatchQueueExpiresAt,
  buildTestMatchStartAt,
  isTestMatchSession,
} from './matchScheduleHelpers.mjs';
import {
  getMatchQueueEntries,
  removeUsersFromMatchQueue,
  upsertMatchQueueEntry,
} from './matchQueueStoreHelpers.mjs';
import { normalizeRunningMatchProgress } from './matchProgressStoreHelpers.mjs';
import { applyMatchLpIfComplete, forfeitSessionParticipant } from './matchCompletionAwards.mjs';
import { findUserById } from './userStoreHelpers.mjs';
import {
  ensureMatchSessions,
  findMatchSessionById,
  findMatchSessionForUser,
  hydrateMatchSessionState,
  isParticipantGroupSealedDnf,
  isParticipantSealedDnf,
  pruneMatchSessions,
  sealDuelFallbackResolutionIfElapsed,
  sealGroupFallbackResolutionIfElapsed,
} from './runningMatchSessionStoreHelpers.mjs';
import { buildRunningMatchStatusResponse } from './matchResponseBuilders.mjs';
import {
  isPendingScheduledPartySession,
  pruneMatchRooms,
  withdrawFromReservedPartySession,
} from './matchRoomStoreHelpers.mjs';
import { isMatchTombstoned, recordVanishedMatch } from './vanishedMatchTombstones.mjs';
// Imported straight from the submodule (not the facade) because ONLY the seal-revision hook
// needs these; the facade re-export surface stays untouched for existing importers.
import {
  annulSealForLateFinish,
  isSealWithinRevisionWindow,
} from './runningMatchSession/matchSessionFallbackSeals.mjs';

// Plausibility slack for a sealed-DNF runner's late finish: the client-reported measured
// elapsed may not exceed the wall clock since the session started by more than this many
// seconds (you cannot measure more running time than has physically elapsed; the slack
// absorbs device clock skew). No weaker than the trust the in-window finish path extends.
const MATCH_SEAL_REVISION_ELAPSED_SLACK_SECONDS = 120;

// `reason: 'disqualified'` (오너 2026-09-09): 케이던스 워치독이 2차 스트라이크로 부정 러닝을
// 판정한 클라이언트의 자진 이탈. 오늘의 기권과 똑같이 liveStatus 'forfeited'로 봉인되고
// (판정·LP·정렬 전부 기권 경로 그대로 = 실격패는 패배), 참가자에 disqualified/forfeitReason이
// 추가로 박힌다. 상태/결과 페이로드는 이 참가자에 `disqualified: true`를 노출해 상대 화면이
// '기권' 대신 '실격'을 그리게 한다. reason이 없으면 바이트 단위로 기존 기권 흐름이다.
// 스탬프 + LP 훅 자체는 forfeitSessionParticipant(matchCompletionAwards)에 있다 — 이 호출이
// 서버에 못 닿은 채 '실격패'/'기권 패' 블롭만 저장될 때 resolver가 같은 헬퍼로 대신 박는다.
export function leaveRunningMatch(store, currentUser, { matchId, reason }) {
  const session = findMatchSessionById(store, matchId);

  if (!session) {
    return { success: true };
  }

  const currentParticipant = session.participants.find((participant) => participant.userId === currentUser.id);

  if (!currentParticipant) {
    return { success: true };
  }

  const state = hydrateMatchSessionState(session);

  if (!['matched', 'active'].includes(state)) {
    throw new ApiError(400, '매칭이 잡힌 뒤에만 혼자 계속 달릴 수 있어요.');
  }

  // 출발 전 '예약' 파티런에서의 '나가기'는 기권이 아니라 예약에서 빠지는 것이다 — 기권으로 박으면
  // 세션이 즉시 '활성'이 되고 상대는 며칠 뒤 슬롯에 유령 매치를 만난다(적대 검증 2026-09-10:
  // 클라의 blocker 자동 복구가 이 경로로 들어온다). 방장이면 예약 전체가 취소된다.
  // 방장 시작 파티런(isPartyRun이지만 예약이 아님)은 예전 기권 경로 그대로다.
  if (isPendingScheduledPartySession(session)) {
    withdrawFromReservedPartySession(store, session, currentUser);
    return { success: true };
  }

  const forfeitedAt = forfeitSessionParticipant(store, session, currentParticipant, { reason });
  const resolvedAt = new Date(forfeitedAt);
  pruneMatchSessions(store, resolvedAt);
  pruneMatchRooms(store, resolvedAt);

  return { success: true };
}

export function acceptRunningMatch(store, currentUser, matchId) {
  const session = findMatchSessionById(store, matchId);

  if (!session || !session.participants.some((participant) => participant.userId === currentUser.id)) {
    throw new ApiError(404, '수락할 매치를 찾지 못했어요.');
  }

  return buildRunningMatchStatusResponse(store, currentUser, {
    mode: session.mode,
    distanceKm: session.distanceKm,
    slotStartAt: session.slotStartAt,
    testMode: isTestMatchSession(session),
  });
}

export function cancelRunningMatch(store, currentUser, { mode, distanceKm, slotStartAt, matchId, testMode = false }) {
  const normalizedDistanceKm = normalizeMatchQueueDistance(distanceKm);
  const queueEntries = getMatchQueueEntries(store, mode, normalizedDistanceKm, slotStartAt, { testMode });
  const session = matchId
    ? findMatchSessionById(store, matchId)
    : findMatchSessionForUser(store, mode, currentUser.id, { distanceKm: normalizedDistanceKm, slotStartAt, testMode });

  removeUsersFromMatchQueue(store, mode, [currentUser.id]);

  if (session && session.participants.some((participant) => participant.userId === currentUser.id)) {
    const state = hydrateMatchSessionState(session);

    if (state === 'active') {
      throw new ApiError(400, '이미 출발한 매치는 취소할 수 없어요.');
    }

    if (state === 'matched') {
      const cancellationDeadline = buildMatchCancellationDeadline(session.slotStartAt, {
        isTestMatch: isTestMatchSession(session),
        isPartyRun: session.isScheduledPartyRun === true,
      });

      if (Date.now() >= cancellationDeadline.getTime()) {
        throw new ApiError(400, isTestMatchSession(session)
          ? '테스트 카운트다운이 시작된 뒤에는 취소할 수 없어요.'
          : '출발 1시간 전부터는 예약을 취소할 수 없어요.');
      }
    }

    // 파티런 예약(친구끼리의 약속, 2026-09-09)은 매칭 풀이 아니다 — 재큐잉 없이 방장이면 예약
    // 전체를 걷고(세션·툼스톤·연결된 방 + 취소 알림), 게스트면 자기만 빠진다(대기실 '나가기'와
    // 같은 규칙). 공식 예약과 방장 시작 파티런은 아래 그대로.
    if (session.isScheduledPartyRun === true) {
      withdrawFromReservedPartySession(store, session, currentUser);
      return { success: true };
    }

    const requeuedParticipants = session.participants
      .filter((participant) => participant.userId !== currentUser.id)
      .filter((participant) => !participant.profileSnapshot)
      .map((participant) => findUserById(store, participant.userId));

    store.matchSessions = ensureMatchSessions(store).filter((entry) => entry.id !== session.id);
    // The other participants' devices may still poll this matchId — tombstone it so
    // their progress lookups get the terminal 410 instead of an endlessly-retried 404.
    recordVanishedMatch(session.id);

    for (const participant of requeuedParticipants) {
      const nextTestSlotStartAt = buildTestMatchStartAt();
      upsertMatchQueueEntry(store, mode, participant.id, session.distanceKm, isTestMatchSession(session) ? nextTestSlotStartAt : session.slotStartAt, isTestMatchSession(session)
        ? {
            testMode: true,
            expiresAt: buildTestMatchQueueExpiresAt(),
          }
        : {});
    }

    return { success: true };
  }

  if (!queueEntries.some((entry) => entry.userId === currentUser.id)) {
    return { success: true };
  }

  return { success: true };
}

export function updateRunningMatchProgress(store, currentUser, { matchId, distanceKm, elapsedSeconds, currentPace, status }) {
  const session = findMatchSessionById(store, matchId);

  if (!session && isMatchTombstoned(matchId)) {
    // Terminal answer for a pruned/vanished match: 410 tells a stranded device to STOP
    // its ~2s retry loop (a plain 404 reads as "maybe transient" and retries forever).
    // The tombstone map is in-memory — after a restart this falls back to the 404 below.
    throw new ApiError(410, '이미 종료돼 정리된 매치예요.', { code: 'match_gone' });
  }

  if (!session || !session.participants.some((participant) => participant.userId === currentUser.id)) {
    throw new ApiError(404, '진행 상태를 반영할 매치를 찾지 못했어요.');
  }

  const sessionState = hydrateMatchSessionState(session);

  if (sessionState === 'matched' && !buildRunningMatchStatusResponse(store, currentUser, {
    mode: session.mode,
    distanceKm: session.distanceKm,
    slotStartAt: session.slotStartAt,
    testMode: isTestMatchSession(session),
  }).readyToStart) {
    throw new ApiError(400, '예약된 시작 시간이 아직 되지 않았어요.');
  }

  if (!['matched', 'active'].includes(sessionState)) {
    throw new ApiError(400, '아직 시작 전인 매치에는 진행 상태를 반영할 수 없어요.');
  }

  const currentParticipant = session.participants.find((participant) => participant.userId === currentUser.id);

  if (resolveParticipantLiveStatus(currentParticipant) === 'forfeited') {
    return buildRunningMatchStatusResponse(store, currentUser, {
      mode: session.mode,
      distanceKm: session.distanceKm,
      slotStartAt: session.slotStartAt,
    });
  }

  const normalizedProgress = normalizeRunningMatchProgress(session, currentParticipant, {
    distanceKm,
    elapsedSeconds,
  }, new Date());
  // The client sends status='finished' when its local distance reaches the
  // configured goal. The server keeps this strict distance fallback for exact
  // progress uploads and makes finish irreversible against stale heartbeats.
  const reachedGoalDistance = normalizedProgress.distanceKm >= session.distanceKm - MATCH_GOAL_DISTANCE_TOLERANCE_KM;
  const alreadyFinished = currentParticipant.liveStatus === 'finished' || Boolean(currentParticipant.finishedAt);
  // 완주 **선언은 거리로 검증한다** (2026-08-24 실전 사고: 4.93km에서 '대결종료'를 누른
  // 러너가 7km 그룹런 1위로 확정됐다 — 클라이언트의 저장 흐름은 매치가 붙어 있으면
  // 무조건 status='finished'를 보내고, 예전의 이 줄은 그 말을 그대로 믿었다). 검증은
  // **원시 신고 거리**로 한다: 정규화 거리는 속도 상한이 수면 랙을 천천히 풀기 때문에,
  // 깨어나며 목표를 넘긴 정직한 완주가 정규화 값으로는 목표 미달로 보일 수 있다 — 서버가
  // 순위 키(elapsedSeconds)도 원시 신고값을 믿는 이상, 거리 게이트가 원시값을 보는 것이
  // 더 약한 신뢰가 아니다. 목표 미달 선언은 아래 사다리에서 'running'으로 강등되어
  // §B4 폴백이 완주자들 아래 DNF로 봉인한다 — 절대 순위에 오르지 못한다.
  const declaredFinishReachedGoal = status === 'finished'
    && Number.isFinite(distanceKm)
    && distanceKm >= session.distanceKm - MATCH_GOAL_DISTANCE_TOLERANCE_KM;
  const requestedFinished = alreadyFinished || declaredFinishReachedGoal || reachedGoalDistance;

  // F4: seal the §B4 fallback FIRST, from raw participant state, BEFORE we apply any
  // finished state. This way a late finish push from the missing runner is blocked even
  // when it is the very first request to arrive after the window elapsed (no poll sealed
  // it yet). A runner the server already SEALED as a DNF must NEVER be marked finished —
  // not finishedAt, not liveStatus='finished', not finishElapsedSeconds — otherwise their
  // late finish would re-enter the standings (via the legacy liveElapsed fallback) and
  // flip the sealed verdict AND the once-only LP application. Their finish is simply
  // ignored; they stay a non-finisher (their reported running/background/paused/etc.).
  if (requestedFinished) {
    sealDuelFallbackResolutionIfElapsed(session, new Date());
    // Group parity: seal the §B4 group fallback FIRST too, from raw participant state, so a
    // late finish from a runner the server already §B4-resolved as DNF — even the very first
    // request after the window elapsed — is blocked and cannot flip an already-sealed group
    // placement (mirrors the duel seal-then-downgrade exactly).
    sealGroupFallbackResolutionIfElapsed(session, new Date());
  }
  let sealedAsDnf = isParticipantSealedDnf(session, currentParticipant.userId)
    || isParticipantGroupSealedDnf(session, currentParticipant.userId);

  // SEAL REVISION: the §B4 seal is PROVISIONAL for a bounded window. A sealed-DNF runner whose
  // finish was merely delayed in transit (iOS screen-off upload freeze) may still land it here:
  // if the finish arrives inside the revision window AND the client-reported measured elapsed is
  // PLAUSIBLE (a positive integer no greater than the wall clock since the session started, plus
  // a small skew slack — you cannot measure more running time than has physically elapsed), the
  // seal is ANNULLED (with a revision marker) and the push proceeds as a NORMAL finish below:
  // the finish freezes first-write-wins, the verdict re-resolves from BOTH measured finishes
  // (faster wins, incl. dead-heat), and the every-done LP path finally fires. The winner can
  // flip AT MOST once: only the one sealed-DNF runner can revise, and once both finishes are
  // frozen nothing can change. Beyond the window (or failing the guard) the existing downgrade
  // below stands byte-for-byte.
  if (sealedAsDnf && requestedFinished) {
    const revisionNow = new Date();
    const startedAtMs = Date.parse(typeof session.startedAt === 'string' ? session.startedAt : '');
    const wallClockSecondsSinceStart = Number.isFinite(startedAtMs)
      ? Math.floor((revisionNow.getTime() - startedAtMs) / 1000)
      : null;
    const plausibleElapsed = Number.isInteger(elapsedSeconds)
      && elapsedSeconds > 0
      && wallClockSecondsSinceStart !== null
      && elapsedSeconds <= wallClockSecondsSinceStart + MATCH_SEAL_REVISION_ELAPSED_SLACK_SECONDS;

    if (plausibleElapsed && isSealWithinRevisionWindow(session, revisionNow)) {
      annulSealForLateFinish(session, currentParticipant.userId, revisionNow);
      sealedAsDnf = false;
    }
  }

  // A sealed DNF runner is never marked finished; downgrade any finish signal to a live,
  // non-terminal status ('running') so they read as a non-finisher. Otherwise honor the
  // finish transition as before. A non-finish status push from a sealed runner passes
  // through unchanged.
  const effectiveStatus = sealedAsDnf
    ? (requestedFinished || status === 'finished' ? 'running' : status)
    : requestedFinished
      ? 'finished'
      : status === 'finished'
        // 목표 미달 완주 선언 — 완주도, 몰수도 아닌 'running'으로 강등한다. 여기서
        // 'forfeited'를 박으면 되돌릴 수 없어서(몰수는 종료 상태), 부분 거리를 실은 첫
        // 저장 푸시와 진짜 목표 거리를 실은 내구 재전송이 경합하는 정직한 완주를 영구히
        // 파괴한다. 'running'은 되돌릴 수 있고, 진짜 미완주자는 §B4가 DNF로 정리한다.
        ? 'running'
        : status;

  // B-2 (finish-flow relief 2026-07-07): an already-finished participant re-pushing 'finished'
  // (post-finish heartbeat / durable finish resend) must NOT re-stamp the live fields. Distance
  // and elapsed are already frozen by the finished short-circuit in
  // normalizeRunningMatchProgress, and stall detection returns the stored status for 'finished'
  // WITHOUT reading liveUpdatedAt (resolveParticipantLiveStatus), so skipping the five stamps
  // changes nothing the server reports — it makes the whole mutation byte-identical, letting
  // the store adapters' no-change serialization skip drop the whole-store row UPDATE for every
  // post-finish push. The sealed-DNF downgrade (effectiveStatus 'running') and the F1 case of a
  // finished participant whose measured finish was never frozen (finishElapsedSeconds null)
  // stamp normally, exactly as before.
  const skipFinishedRepushLiveStamps = currentParticipant.liveStatus === 'finished'
    && effectiveStatus === 'finished'
    && currentParticipant.finishElapsedSeconds != null;

  // 오너 실기기 대결 2026-08-09 — the server was disguising a dead runner as a live one. The
  // Android native uploader re-POSTs the LAST JS-BUILT PAYLOAD BYTE-FOR-BYTE every ~3s and never
  // recomputes anything (MatchUploadForegroundService: "The native side NEVER recomputes
  // distance/pace/elapsed"). So when the Galaxy's JS froze, the same body kept arriving and
  // liveUpdatedAt kept being restamped — the 90s stall detector could never fire, the opponent's
  // phone confidently rendered a frozen 3.05km as "연결됨", and no safety net ran.
  //
  // The discriminator is "did this push carry NEW information", NOT "did distance move": an
  // identical cached re-POST repeats the same elapsedSeconds too, while a runner genuinely
  // standing still at a crossing is on a LIVE JS thread whose elapsed keeps advancing. So a
  // stationary runner still reads as connected, and only a repeat of an already-stored payload
  // leaves the liveness clock alone — which is what lets the client's existing opponent-stale
  // lifeline surface the outage instead of trusting a stale number.
  // Compare the RAW pushed payload, never the normalized one: the server rewrites elapsedSeconds
  // from its own wall clock, so every normalized push looks new even when the device sent the same
  // bytes. The replay is only visible in what the device actually sent.
  const livePushSignature = `${distanceKm}|${elapsedSeconds}|${status}`;
  const carriesNewLiveInformation = currentParticipant.liveUpdatedAt == null
    || currentParticipant.lastLivePushSignature !== livePushSignature;

  if (!skipFinishedRepushLiveStamps) {
    currentParticipant.liveDistanceKm = normalizedProgress.distanceKm;
    currentParticipant.liveElapsedSeconds = normalizedProgress.elapsedSeconds;
    currentParticipant.livePace = currentPace;
    // Stored so the NEXT push can recognise a byte-identical replay. An unchanged replay rewrites
    // the same value, so the store's no-change serialize skip (B-2/B-3) is preserved.
    currentParticipant.lastLivePushSignature = livePushSignature;
    if (carriesNewLiveInformation) {
      currentParticipant.liveUpdatedAt = new Date().toISOString();
    }
    currentParticipant.liveStatus = effectiveStatus;

    // CHECKPOINT-FAIR LIVE COMPARE (2026-07-09) — sample this push onto the 10s grid, but ONLY
    // for a genuine live progress push: effectiveStatus running/background (parity with the
    // contributesToLiveCheckpoint gate in matchSessionSnapshots) AND a push that actually
    // CARRIED a distance (a finite raw distanceKm). A finished/forfeited/paused push is never
    // sampled (a finish must not snap a partial bucket into the grid — the verdict stays on
    // finishElapsedSeconds), and a time-only server-backed backfill (no distanceKm) is skipped
    // so the grid indexes off the elapsed of the sample that carried the distance.
    // appendCheckpointSample is PURE + returns the SAME array reference on a no-change re-push,
    // so the store's whole-blob no-change serialize skip is preserved (respects B-2/B-3).
    if (['running', 'background'].includes(effectiveStatus) && Number.isFinite(distanceKm)) {
      currentParticipant.checkpoints = appendCheckpointSample(
        currentParticipant.checkpoints,
        normalizedProgress.elapsedSeconds,
        normalizedProgress.distanceKm,
      );
    }
  }
  if (!session.startedAt) {
    session.startedAt = currentParticipant.liveUpdatedAt;
  }

  if (effectiveStatus === 'finished') {
    currentParticipant.finishedAt = currentParticipant.finishedAt ?? currentParticipant.liveUpdatedAt;
    // Freeze the MEASURED finish time once, first-write-wins. The rank key is the
    // runner's OWN slot-anchored elapsed at the finishing sample (the client-reported
    // elapsedSeconds), NOT the server receive time (finishedAt), which is jitter-prone.
    // finishedAt stays for audit but no longer decides the duel.
    //
    // F1: freeze ONLY a POSITIVE measured value. A client-reported elapsedSeconds of 0
    // (or any non-positive/invalid value) must never be frozen as the official finish —
    // otherwise a runner could "win" with a 0-second finish. If no positive value is
    // available yet, leave finishElapsedSeconds null; the standings legacy-fallback still
    // ranks a finished runner via liveElapsedSeconds.
    if (currentParticipant.finishElapsedSeconds === null || currentParticipant.finishElapsedSeconds === undefined) {
      const measured = Number.isInteger(elapsedSeconds) && elapsedSeconds > 0
        ? elapsedSeconds
        : normalizedProgress.elapsedSeconds > 0
          ? normalizedProgress.elapsedSeconds
          : null;
      if (Number.isInteger(measured) && measured > 0) {
        currentParticipant.finishElapsedSeconds = measured;
        // 완주로 받아들인 푸시의 원시 거리로 저장 거리를 목표까지 끌어올린다 — 속도 상한이
        // 눌러 둔 저장 거리(수면 랙)가 남아 있으면 페이스 라벨이 그 랙으로 계산된다.
        if (Number.isFinite(distanceKm)) {
          const finishDistanceKm = Math.min(session.distanceKm, distanceKm);
          if (finishDistanceKm > (currentParticipant.liveDistanceKm ?? 0)) {
            currentParticipant.liveDistanceKm = Number(finishDistanceKm.toFixed(3));
          }
        }
        // F2: the displayed self-time (liveElapsedSeconds, the value the runner sees and
        // the value buildOfficialSessionStandings reads when no frozen finish exists) must
        // equal the authoritative rank key, so the shown time and the ranked time can never
        // diverge on the finishing push. The already-finished short-circuit in
        // normalizeRunningMatchProgress keeps BOTH frozen on every subsequent push.
        currentParticipant.liveElapsedSeconds = currentParticipant.finishElapsedSeconds;
      }
    }
  }

  if (effectiveStatus === 'running') {
    currentParticipant.finishedAt = null;
  }

  if (effectiveStatus === 'background' || effectiveStatus === 'paused') {
    currentParticipant.finishedAt = null;
  }

  applyMatchLpIfComplete(store, session);
  const response = buildRunningMatchStatusResponse(store, currentUser, {
    mode: session.mode,
    distanceKm: session.distanceKm,
    slotStartAt: session.slotStartAt,
    matchId: session.id,
    sessionOverride: session,
  });
  const resolvedAt = new Date(currentParticipant.liveUpdatedAt);
  runProgressPollPrunesIfDue(store, resolvedAt);

  return response;
}

// B-3 (finish-flow relief 2026-07-07): the ~2.5s progress-POST heartbeats from every live
// runner each ran pruneMatchSessions + pruneMatchRooms (each re-running the seal/heal sweep)
// while HOLDING the whole-store row lock. Physical pruning is time-based housekeeping, not
// per-push semantics, so on THIS endpoint it is throttled to at most once per
// PROGRESS_PRUNE_MIN_INTERVAL_MS server-wide. Seal/finalize timing shifts by at most the
// interval inside the 90s §B4 window, and every OTHER prune caller (leave/forfeit, session
// lookups, room sync, status polls, the /result locked path) still prunes immediately. The
// finish handler's direct sealDuel/GroupFallbackResolutionIfElapsed calls above are untouched,
// so a due seal still blocks a late finish on the very push that carries it. `now` drives the
// throttle gate and is injectable for tests; the last-run marker is module-level (one server
// process), exactly like the tombstone map.
export const PROGRESS_PRUNE_MIN_INTERVAL_MS = 15_000;

let lastProgressPruneMs = 0;

export function runProgressPollPrunesIfDue(store, resolvedAt, now = new Date()) {
  const nowMs = now.getTime();

  if (Number.isFinite(nowMs) && nowMs - lastProgressPruneMs < PROGRESS_PRUNE_MIN_INTERVAL_MS) {
    return false;
  }

  lastProgressPruneMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  pruneMatchSessions(store, resolvedAt);
  pruneMatchRooms(store, resolvedAt);
  return true;
}

// Test hook — the throttle marker is module-global, so tests that pin per-push prune/sweep
// side effects reset it between pushes (mirrors clearVanishedMatchTombstones).
export function resetProgressPruneThrottle() {
  lastProgressPruneMs = 0;
}
