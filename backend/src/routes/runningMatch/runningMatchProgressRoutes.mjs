import { ALLOW_TEST_MATCHES } from '../../config.mjs';
import { parseLenientMatchSlotInput } from '../../lib/matchSlotValidation.mjs';

export async function routeRunningMatchProgressRoutes(deps) {
  const { method, pathname } = deps;

  if (pathname === '/api/running/matches/status' && method === 'POST') {
    await handleFetchRunningMatchStatus(deps);
    return true;
  }

  if (pathname === '/api/running/matches/progress' && method === 'POST') {
    await handleUpdateRunningMatchProgress(deps);
    return true;
  }

  const resultMatch = pathname.match(/^\/api\/running\/matches\/([^/]+)\/result$/);

  if (resultMatch && method === 'GET') {
    await handleFetchRunningMatchResult(deps, resultMatch[1]);
    return true;
  }

  return false;
}

async function handleFetchRunningMatchResult({
  ApiError,
  buildMatchResultByMatchId,
  loadStore,
  mutateStore,
  sweepStuckMatchSessionFallbacks,
  request,
  requireUser,
  response,
  sendJson,
}, rawMatchId) {
  let matchId;

  try {
    matchId = decodeURIComponent(rawMatchId).trim();
  } catch {
    // A malformed id can never name a real match → same 404 a participant check would give,
    // so the endpoint never leaks whether an id format is "valid but missing".
    throw new ApiError(404, '대결 결과를 찾을 수 없어.');
  }

  if (!matchId || matchId.length > 128) {
    throw new ApiError(404, '대결 결과를 찾을 수 없어.');
  }

  // B-1 (finish-flow relief 2026-07-07): LOCK-FREE FAST PATH. Every /result poll used to run
  // under mutateStore, so during a finish window each poll queued on the single whole-store
  // row lock behind heartbeats and saves. But the locked read is only load-bearing when the
  // seal/heal sweep actually has WORK to do (seal a §B4 fallback, finalize a closed revision
  // window, back-fill a finisher's saved run). So: take an MVCC snapshot (loadStore — both
  // adapters return a throwaway clone), run the SAME sweep on the clone, and when it reports
  // no change — the overwhelmingly common finalized/back-filled steady state — answer as a
  // pure read from the snapshot without ever touching the lock. buildMatchResultByMatchId is
  // a pure read, and the sweep is idempotent, so the fast-path payload is byte-identical to
  // what the locked path would have produced. Auth/404 semantics are identical on both paths
  // (requireUser + the builder's participant checks run against the same store state).
  const snapshot = await loadStore();
  const probeUser = requireUser(snapshot, request);

  if (!sweepStuckMatchSessionFallbacks(snapshot)) {
    sendJson(response, 200, buildMatchResultByMatchId(snapshot, probeUser, matchId));
    return;
  }

  // Heal needed → exactly today's locked path. DURABLE one-finisher resolution: this read runs
  // under mutateStore so the FIRST /result request after the §B4 window elapses PERSISTS the
  // fallback seal AND back-fills the lone finisher's saved run (so the 기록상세 card heals),
  // instead of computing the verdict against a throwaway loadStore() clone that is never
  // written. We run the targeted seal+back-fill SWEEP (NOT pruneMatchSessions, which would
  // DROP a both-finished session before the raw lookup can resolve it). The sweep only
  // seals/heals — it never removes a session — and is idempotent + sticky, so concurrent
  // /result reads can never corrupt or double-seal (a racing writer that already persisted the
  // heal simply makes this locked sweep a no-op and the adapter skips the write).
  // buildMatchResultByMatchId then reads the still-present (now-persisted) session via its raw
  // lookup, exactly as before.
  const payload = await mutateStore((store) => {
    const currentUser = requireUser(store, request);
    sweepStuckMatchSessionFallbacks(store);
    return buildMatchResultByMatchId(store, currentUser, matchId);
  });

  sendJson(response, 200, payload);
}

async function handleFetchRunningMatchStatus({
  buildRunningMatchStatusResponse,
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  validateDuelMatchDistanceKm,
  validateMatchMode,
  validateMatchSlotInput,
}) {
  const body = await parseJsonBody(request);
  const mode = validateMatchMode(body.mode);
  const distanceKm = validateDuelMatchDistanceKm(body.distanceKm);
  // Same intake gate as the request routes: when test matches are disallowed the
  // client-supplied flag is silently ignored (coerced false), never rejected.
  const testMode = ALLOW_TEST_MATCHES && body.testMode === true;
  const matchId = typeof body.matchId === 'string' && body.matchId.trim() ? body.matchId.trim() : undefined;
  const slotStartAt = testMode
    ? (typeof body.slotStartAt === 'string' && body.slotStartAt.trim() ? body.slotStartAt.trim() : new Date().toISOString())
    : matchId
      ? parseLenientMatchSlotInput(body.slotStartAt)
      : validateMatchSlotInput(body.slotStartAt);
  const payload = await mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return buildRunningMatchStatusResponse(store, currentUser, {
      mode,
      distanceKm,
      slotStartAt,
      testMode,
      matchId,
    });
  });

  sendJson(response, 200, payload);
}

async function handleUpdateRunningMatchProgress({
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  updateRunningMatchProgress,
  validateDistanceKm,
  validateRunningMatchProgressDistanceKm = validateDistanceKm,
  validateNonNegativeInteger,
  validatePace,
  validateRequiredString,
}) {
  const body = await parseJsonBody(request);
  const matchId = validateRequiredString(body.matchId, '진행 상태를 반영할 매치 아이디가 필요해.');
  const distanceKm = validateRunningMatchProgressDistanceKm(body.distanceKm, '러닝 거리를 입력해줘.');
  const elapsedSeconds = validateNonNegativeInteger(body.elapsedSeconds, '러닝 시간은 0초 이상이어야 해.');
  const currentPace = String(body.currentPace ?? '').trim() === '--:--/km'
    ? '--:--/km'
    : validatePace(body.currentPace, '현재 페이스가 올바르지 않아.');
  const status = ['running', 'background', 'paused', 'finished'].includes(body.status)
    ? body.status
    : 'running';
  const payload = await mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return updateRunningMatchProgress(store, currentUser, {
      matchId,
      distanceKm,
      elapsedSeconds,
      currentPace,
      status,
    });
  });

  sendJson(response, 200, payload);
}
