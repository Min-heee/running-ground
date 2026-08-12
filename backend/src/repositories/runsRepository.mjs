import { attachRouteToRunPayload, attachStoredRunRoute } from '../lib/runHelpers.mjs';
import { resolveRaceEventCompletionStamp } from '../lib/raceEventCompletion.mjs';
import { compareRunsLatestFirst } from '../lib/userStoreHelpers.mjs';
import { applyRunIntegrityCheck } from '../lib/runIntegrity.mjs';
import { findChaseArena } from '../lib/chase/chaseArenas.mjs';
import { releaseChasePresenceForUser } from '../lib/chase/chasePresence.mjs';
import { formatKstDisplayTimestamp } from '../lib/kstDate.mjs';
import { deriveDurationSecondsFromPace } from '../lib/paceDuration.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isSyncableSourceType(sourceType) {
  return sourceType !== 'manual';
}

function inferSourceTypeFromLabel(label, sourceLabels) {
  const normalizedLabel = normalizeOptionalString(label).toLowerCase();

  if (normalizedLabel === 'nrc') {
    return 'nrc';
  }

  if (normalizedLabel === 'mynb' || normalizedLabel === 'my nb' || normalizedLabel === 'new balance') {
    return 'mynb';
  }

  return Object.entries(sourceLabels)
    .find(([, displayName]) => displayName.toLowerCase() === normalizedLabel)?.[0] ?? null;
}

function getRunSourceType(run, sourceLabels) {
  return normalizeOptionalString(run.sourceType) || inferSourceTypeFromLabel(run.source, sourceLabels);
}

function createNowIso() {
  return new Date().toISOString();
}

function createDisplayTimestamp() {
  // KST 고정 — 로컬 getHours()는 UTC 드롭릿에서 9시간 어긋난다.
  return formatKstDisplayTimestamp();
}

export function ensureIntegrationImports(store) {
  if (!Array.isArray(store.integrationImports)) {
    store.integrationImports = [];
  }

  return store.integrationImports;
}

export function getPendingImportCount(store, userId, sourceType) {
  return ensureIntegrationImports(store)
    .filter((entry) => entry.userId === userId && entry.sourceType === sourceType)
    .length;
}

export function buildRunExternalKey(input) {
  const sourceType = normalizeOptionalString(input.sourceType);
  const externalId = normalizeOptionalString(input.externalId);

  if (!sourceType || !externalId) {
    return null;
  }

  return `${sourceType}::${externalId}`;
}

export function buildRunFingerprint(input) {
  const sourceType = normalizeOptionalString(input.sourceType);
  const distanceKm = Number(input.distanceKm);
  const startedAt = normalizeOptionalString(input.startedAt);

  return [
    sourceType || 'unknown',
    normalizeOptionalString(input.date),
    Number.isFinite(distanceKm) ? distanceKm.toFixed(1) : '0.0',
    normalizeOptionalString(input.pace),
    startedAt || 'na',
  ].join('::');
}

function parseTimestampMs(value) {
  const text = normalizeOptionalString(value);

  if (!text) {
    return null;
  }

  const timestampMs = new Date(text).getTime();
  return Number.isFinite(timestampMs) ? timestampMs : null;
}

export function buildRunTimeWindow(input) {
  const startedAtMs = parseTimestampMs(input.startedAt);

  if (!startedAtMs) {
    return null;
  }

  const durationSeconds = Number(input.durationSeconds);
  const durationMs = Number.isFinite(durationSeconds) && durationSeconds > 0
    ? Math.round(durationSeconds * 1000)
    : null;
  let endedAtMs = parseTimestampMs(input.endedAt);

  if ((!endedAtMs || endedAtMs <= startedAtMs) && durationMs) {
    endedAtMs = startedAtMs + durationMs;
  }

  if (!endedAtMs || endedAtMs <= startedAtMs) {
    return null;
  }

  return {
    startMs: startedAtMs,
    endMs: endedAtMs,
    durationMs: endedAtMs - startedAtMs,
  };
}

export function areRunsPotentialDuplicates(left, right) {
  const leftWindow = buildRunTimeWindow(left);
  const rightWindow = buildRunTimeWindow(right);

  if (!leftWindow || !rightWindow) {
    return false;
  }

  const leftDistanceKm = Number(left.distanceKm);
  const rightDistanceKm = Number(right.distanceKm);
  const distanceGapKm = Math.abs(leftDistanceKm - rightDistanceKm);

  if (!Number.isFinite(distanceGapKm) || distanceGapKm > 0.8) {
    return false;
  }

  const startGapMs = Math.abs(leftWindow.startMs - rightWindow.startMs);
  const endGapMs = Math.abs(leftWindow.endMs - rightWindow.endMs);

  if (startGapMs <= 15 * 60 * 1000 && endGapMs <= 15 * 60 * 1000) {
    return true;
  }

  const overlapMs = Math.min(leftWindow.endMs, rightWindow.endMs) - Math.max(leftWindow.startMs, rightWindow.startMs);

  if (overlapMs <= 0) {
    return false;
  }

  const shorterDurationMs = Math.min(leftWindow.durationMs, rightWindow.durationMs);
  return overlapMs >= shorterDurationMs * 0.5;
}

function requireConnectedSource(user, sourceType, createError) {
  const source = user.connectedSources.find((entry) => entry.sourceType === sourceType);

  if (!source) {
    throw createError(404, '선택한 연동 소스를 찾을 수 없어요.');
  }

  return source;
}

function requireSyncableConnectedSource(user, sourceType, createError) {
  const source = requireConnectedSource(user, sourceType, createError);

  if (!isSyncableSourceType(sourceType)) {
    throw createError(400, '수동 입력 소스는 외부 import 방식 대신 앱 안에서 직접 기록을 추가해주세요.');
  }

  if (!source.connected) {
    throw createError(409, '이 소스는 아직 연결되지 않았어요. 먼저 연결한 뒤 기록을 가져와주세요.');
  }

  return source;
}

function getRunsForUser(store, userId) {
  return store.runs
    .filter((entry) => entry.userId === userId)
    .sort(compareRunsLatestFirst);
}

function getRunForUser(store, userId, runId, createError) {
  const runs = getRunsForUser(store, userId);

  if (!runs.length) {
    throw createError(404, '러닝 기록이 없어요.');
  }

  if (!runId) {
    return runs[0];
  }

  const run = runs.find((entry) => entry.id === runId);

  if (!run) {
    throw createError(404, '러닝 기록을 찾을 수 없어요.');
  }

  return run;
}

function importPendingRunsForUser(store, user, {
  nextId,
  formatTimestamp,
  nowIso,
  sourceLabels,
}) {
  const queue = ensureIntegrationImports(store);
  const connectedSources = user.connectedSources.filter((source) => source.connected && isSyncableSourceType(source.sourceType));
  const connectedSourceTypes = new Set(connectedSources.map((source) => source.sourceType));
  const sourceDisplayNameByType = new Map(connectedSources.map((source) => [source.sourceType, source.displayName]));
  const currentQueue = [...queue];
  const pendingImports = currentQueue.filter((entry) => entry.userId === user.id && connectedSourceTypes.has(entry.sourceType));
  const existingExternalKeys = new Set();
  const existingFingerprints = new Set();
  const existingTimedRuns = [];
  const processedImportIds = new Set();
  const importedRunIds = [];
  const lastSyncedAt = formatTimestamp();
  let scannedRuns = 0;
  let importedRuns = 0;
  let duplicateRuns = 0;

  for (const run of store.runs.filter((entry) => entry.userId === user.id)) {
    const sourceType = getRunSourceType(run, sourceLabels);
    const externalKey = buildRunExternalKey({
      sourceType,
      externalId: run.externalId,
    });

    if (externalKey) {
      existingExternalKeys.add(externalKey);
    }

    if (sourceType) {
      existingFingerprints.add(buildRunFingerprint({
        sourceType,
        date: run.date,
        distanceKm: run.distanceKm,
        pace: run.pace,
        startedAt: run.startedAt,
      }));
    }

    existingTimedRuns.push(run);
  }

  pendingImports.sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }

    return String(left.receivedAt).localeCompare(String(right.receivedAt));
  });

  for (const entry of pendingImports) {
    scannedRuns += 1;
    processedImportIds.add(entry.id);

    const externalKey = buildRunExternalKey(entry);
    const fingerprint = buildRunFingerprint(entry);
    const timedDuplicate = existingTimedRuns.some((existingRun) => areRunsPotentialDuplicates(existingRun, entry));

    if ((externalKey && existingExternalKeys.has(externalKey)) || existingFingerprints.has(fingerprint) || timedDuplicate) {
      duplicateRuns += 1;
      continue;
    }

    const run = {
      id: nextId('run'),
      userId: user.id,
      date: entry.date,
      distanceKm: entry.distanceKm,
      pace: entry.pace,
      source: entry.sourceLabel ?? sourceDisplayNameByType.get(entry.sourceType) ?? sourceLabels[entry.sourceType] ?? entry.sourceType,
      sourceType: entry.sourceType,
      ...(entry.externalId ? { externalId: entry.externalId } : {}),
      ...(typeof entry.durationSeconds === 'number' ? { durationSeconds: entry.durationSeconds } : {}),
      ...(entry.startedAt ? { startedAt: entry.startedAt } : {}),
      ...(entry.endedAt ? { endedAt: entry.endedAt } : {}),
      createdAt: nowIso(),
      importedAt: lastSyncedAt,
    };

    store.runs.push(run);
    importedRuns += 1;
    importedRunIds.push(run.id);

    if (externalKey) {
      existingExternalKeys.add(externalKey);
    }

    existingFingerprints.add(fingerprint);
    existingTimedRuns.push(run);
  }

  store.integrationImports = currentQueue.filter((entry) => !processedImportIds.has(entry.id));
  user.connectedSources = user.connectedSources.map((source) => (
    source.connected && connectedSourceTypes.has(source.sourceType)
      ? {
        ...source,
        lastSyncedAt,
      }
      : source
  ));

  return {
    success: true,
    syncedSources: connectedSources.length,
    scannedRuns,
    importedRuns,
    duplicateRuns,
    syncedRuns: importedRuns,
    importedRunIds,
    lastSyncedAt,
  };
}

// B-5 (finish-flow relief 2026-07-07): shared never-downgrade predicate for the match-save
// dedupe-as-upgrade below (used by BOTH the json and postgres repositories). A matchResult is
// DEFINITE when it carries a final verdict the resolver produced (duel win/lose/draw tone,
// group integer rank) or is a self-contained forfeit record (기권 badge — terminal by design).
// A retry's re-resolved result may OVERWRITE the stored one unless that would replace a
// definite verdict with a PENDING placeholder — the same direction-lock
// backFillFinisherSavedRuns applies when it heals saved blobs.
export function isDefiniteMatchResult(matchResult) {
  if (!matchResult || typeof matchResult !== 'object') {
    return false;
  }

  if (/기권/.test(String(matchResult.badgeLabel ?? ''))) {
    return true;
  }

  return matchResult.mode === 'group'
    ? Number.isInteger(matchResult.rank)
    : ['win', 'lose', 'draw'].includes(matchResult.resultTone);
}

export function shouldOverwriteMatchResult(existingMatchResult, reResolvedMatchResult) {
  return !isDefiniteMatchResult(existingMatchResult) || isDefiniteMatchResult(reResolvedMatchResult);
}

// 파티런 조기종료 파밍 차단 스탬프(matchGoalDistanceKm — runRoutes가 세션 생존 시에만
// 찍는 서버 전용 필드, 클라 입력에선 validator가 걷어냄)는 재전송 업그레이드에서
// 보존해야 한다 (적대 리뷰 2026-08-06): 세션이 사라진 뒤의 저장 대기열 드레인/재시도는
// 스탬프 없는 클라 블롭이라, 통째로 덮으면 파밍 차단(목표 미달 파티런 보너스 0)이 풀린다.
export function preserveMatchGoalStamp(existingMatchResult, nextMatchResult) {
  const existingGoal = existingMatchResult?.matchGoalDistanceKm;
  if (Number.isFinite(existingGoal) && !Number.isFinite(nextMatchResult?.matchGoalDistanceKm)) {
    return { ...nextMatchResult, matchGoalDistanceKm: existingGoal };
  }
  return nextMatchResult;
}

// 저장 중인 기록의 '완주 근거' 조각 — 목표 거리를 실제로 채웠는지 판정하는 데 필요한 실측값만
// 추린다. 이 기록은 아직 store.runs에 없어서(저장 직전이다) resolver가 스스로 찾을 수 없고,
// matchResult 블롭의 comparedDistanceKm은 화면 꺼짐 정지로 얼어붙는 값이라 대신 쓸 수 없다.
function buildSavingRunEvidence(input) {
  return {
    distanceKm: input?.distanceKm,
    durationSeconds: input?.durationSeconds,
    ...(typeof input?.cadenceSpm === 'number' ? { cadenceSpm: input.cadenceSpm } : {}),
  };
}

// 승자 0P 근치 (오너 2026-08-09): 매치 기록이 저장된 직후, 같은 matchId를 가진 상대의
// PENDING 블롭을 서버가 스스로 확정 판정으로 승격시킨다 (둘 다 저장된 시점 = 승패가 확정되는
// 시점). 치유에 실패해도 저장 자체는 절대 실패하면 안 되므로 — 기록 유실 방지가 포인트 정확도보다
// 우선이다 — 삼켜서 로그만 남긴다. applyRunIntegrityCheck와 같은 방침.
function healMatchCounterparts({ backFillMatchCounterparts, store, matchResult, invalidateUserMetrics }) {
  if (!matchResult) {
    return;
  }

  try {
    const healedUserIds = backFillMatchCounterparts(store, matchResult) ?? [];

    // 포인트는 저장된 잔액이 아니라 기록에서 파생된다 — 고쳐진 유저의 메모된 메트릭만 버리면
    // 다음 조회에서 보너스가 정확히 한 번 반영된다.
    for (const healedUserId of healedUserIds) {
      invalidateUserMetrics(store, healedUserId);
    }
  } catch (error) {
    console.error(`[match-backfill] counterpart heal failed — run save kept: ${error?.message ?? error}`);
  }
}

export function createJsonRunsRepository({
  loadStore,
  mutateStore,
  requireUserByToken,
  nextId,
  buildRunDetail,
  getUserMetrics,
  decorateIntegrationSource,
  createError,
  sourceLabels,
  nowIso = createNowIso,
  formatTimestamp = createDisplayTimestamp,
  // C1/C2: the SERVER decides a duel's win/lose at save. Given (store, user, matchResult) it
  // returns the server-authoritative matchResult (overwriting any client-claimed verdict) or a
  // PENDING result when the verdict is not yet resolvable. Defaults to identity so callers that
  // do not pass it (and group/non-match runs) keep their behavior exactly as before.
  resolveMatchResult = (store, user, matchResult) => matchResult,
  // 승자 0P 근치 (오너 2026-08-09): 이 저장이 매치의 마지막 조각일 수 있다 — 그 순간 상대의
  // 저장된 블롭은 아직 PENDING("결과 집계 중")이고, resultTone이 없어 보너스가 0으로 굳어 있다.
  // 주어진 (store, matchResult)로 같은 matchId를 가진 나머지 저장 기록을 서버 authoritative
  // resolver로 다시 풀어 확정 판정으로 승격시키고, 실제로 고쳐진 유저 id 목록을 돌려준다.
  // 기본값은 빈 배열 — 이걸 넘기지 않는 호출자는 기존 동작 그대로다.
  backFillMatchCounterparts = () => [],
  // Drops the user's memoized metrics so the post-save recompute sees the just-pushed run. The
  // verdict resolver reads the opponent's runner profile (→ metrics) before the run is pushed,
  // which would otherwise leave a stale, pre-push metrics entry cached and miss the new run's
  // match bonus. No-op by default for callers (and stores) without a metrics cache.
  invalidateUserMetrics = () => {},
  // #209: resolves a run's GPS route from the run_routes side table when the store driver keeps
  // routes out of the whole-store blob (postgres). Defaults to null so the json driver (and any
  // caller that does not wire it) keeps today's embedded-route behavior byte-for-byte.
  getStoredRunRoute = async () => null,
}) {
  return {
    async getRun({ token, runId }) {
      const store = await loadStore();
      const user = requireUserByToken(store, token);
      const run = await attachStoredRunRoute(getRunForUser(store, user.id, runId, createError), getStoredRunRoute);
      const metrics = getUserMetrics(store, user.id);

      return buildRunDetail(run, metrics.currentWeekDistanceKm, undefined, metrics);
    },

    async createManualRun({ token, input }) {
      return mutateStore((store) => {
        const user = requireUserByToken(store, token);
        // 수동 기록은 시간 입력이 없다 — 페이스 × 거리로 도출해 저장해야
        // 홈 '내 러닝 기록' 시간 합계에 잡힌다.
        const durationSeconds = deriveDurationSecondsFromPace(input.pace, input.distanceKm);
        const run = {
          id: nextId('run'),
          userId: user.id,
          date: input.date,
          distanceKm: input.distanceKm,
          pace: input.pace,
          ...(durationSeconds !== null ? { durationSeconds } : {}),
          source: 'Manual',
          sourceType: 'manual',
          createdAt: nowIso(),
        };

        store.runs.push(run);

        const manualSource = user.connectedSources.find((entry) => entry.sourceType === 'manual');

        if (manualSource) {
          manualSource.connected = true;
          manualSource.connectionStatus = 'connected';
          manualSource.lastSyncedAt = formatTimestamp();
        }

        const metrics = getUserMetrics(store, user.id);
        return buildRunDetail(run, metrics.currentWeekDistanceKm, undefined, metrics);
      });
    },

    async createTrackedRun({ token, input }) {
      const payload = await mutateStore((store) => {
        const user = requireUserByToken(store, token);

        // P1-2 stopgap idempotency: a retried /api/runs/tracked after a timeout must NOT double
        // count points / weekly distance / records. Match an already-saved run for the SAME
        // (userId, startedAt) — exact startedAt ISO string — and return its payload instead of
        // inserting a duplicate. The durable fix is a client-supplied clientRunId (post-launch);
        // startedAt collides only for genuine same-second re-submits of the same run.
        if (input.startedAt && !input.matchResult) {
          const existingRun = store.runs.find((entry) => (
            entry.userId === user.id && entry.startedAt === input.startedAt
          ));

          if (existingRun) {
            const existingMetrics = getUserMetrics(store, user.id);
            return buildRunDetail(existingRun, existingMetrics.currentWeekDistanceKm, undefined, existingMetrics);
          }
        }

        // B-5 (finish-flow relief 2026-07-07) dedupe-as-UPGRADE for match saves: a retried match
        // save with the SAME (userId, startedAt) AND the SAME matchResult.matchId must not insert
        // a duplicate run row (a landed-but-timed-out original + the client retry used to double
        // the run / weekly distance / records). Match saves cannot simply short-circuit like the
        // solo dedupe above — the duel/group reconcile flow deliberately re-saves the same run to
        // upgrade a PENDING verdict once the opponent's run lands — so the retry RE-RUNS the
        // server-authoritative resolver and overwrites the EXISTING run's matchResult in place
        // (preserving the intentional PENDING→resolved upgrade), never overwriting a definite
        // verdict with a PENDING placeholder (shouldOverwriteMatchResult). Match points/LP
        // already dedupe by matchId, and metrics recompute off the single stored row.
        const retryMatchId = typeof input.matchResult?.matchId === 'string' && input.matchResult.matchId
          ? input.matchResult.matchId
          : null;

        // dedupe 구멍 (적대 리뷰 2026-08-06): matchId 없는 matchResult 재전송은 솔로
        // dedupe(!matchResult)와 B-5(matchId 필요)를 모두 비켜가 중복 행을 만든다 —
        // 저장 대기열 드레인이 이 클래스의 재전송을 자동화하므로, 같은 (userId,
        // startedAt) 정확 일치로 기존 행을 돌려준다.
        if (input.startedAt && input.matchResult && !retryMatchId) {
          const existingRun = store.runs.find((entry) => (
            entry.userId === user.id && entry.startedAt === input.startedAt
          ));

          if (existingRun) {
            const existingMetrics = getUserMetrics(store, user.id);
            return buildRunDetail(existingRun, existingMetrics.currentWeekDistanceKm, undefined, existingMetrics);
          }
        }

        // startedAt 무관 매치 dedupe (2026-08-07 네이티브 배달): 같은 유저가 같은 매치로
        // 두 번 저장하는 정당한 케이스는 없다(매치 1회 = 런 1개). 그런데 저장 경로마다
        // startedAt이 다르다 — 화면 꺼짐 네이티브 배달은 원시 트래킹 시작시각, 앱을 연 뒤의
        // JS 저장은 슬롯 앵커 시각(trackingDisplayModel). startedAt까지 일치를 요구하면 두
        // 경로가 서로를 못 알아보고 같은 매치가 두 행으로 남아 포인트가 이중 적립된다.
        if (retryMatchId) {
          const existingRun = store.runs.find((entry) => (
            entry.userId === user.id
            && entry.matchResult?.matchId === retryMatchId
          ));

          if (existingRun) {
            const reResolvedMatchResult = resolveMatchResult(
              store,
              user,
              input.matchResult,
              buildSavingRunEvidence(input),
            );

            if (reResolvedMatchResult && shouldOverwriteMatchResult(existingRun.matchResult, reResolvedMatchResult)) {
              existingRun.matchResult = clone(preserveMatchGoalStamp(existingRun.matchResult, reResolvedMatchResult));
            }

            // Anti-cheat V1 stage 2: the reconcile re-save that upgrades a PENDING verdict is
            // also the moment the opponent's finish (and therefore this user's applied LP) may
            // have landed since the original save — retry classification + LP revocation on
            // the stored row. Idempotent via run.integrity.lpRevoked; never throws.
            applyRunIntegrityCheck({ store, user, run: existingRun, nowIso });

            // 이 재저장이 매치의 마지막 조각이었을 수 있다 — 상대의 PENDING 블롭도 같이 푼다.
            healMatchCounterparts({
              backFillMatchCounterparts,
              store,
              matchResult: existingRun.matchResult,
              invalidateUserMetrics,
            });

            // The resolver may have read (and cached) this user's metrics before the upgrade;
            // drop the entry so the recompute sees the upgraded blob's match bonus exactly once.
            invalidateUserMetrics(store, user.id);
            const existingMetrics = getUserMetrics(store, user.id);
            return buildRunDetail(existingRun, existingMetrics.currentWeekDistanceKm, undefined, existingMetrics);
          }
        }

        // C1/C2: resolve the duel verdict SERVER-side from the live match session before
        // persisting. The client-supplied resultTone/opponentName are never trusted — they are
        // overwritten by the server verdict, or replaced with a PENDING result when the verdict
        // is not yet resolvable. Group runs and non-match runs pass through untouched.
        const resolvedMatchResult = input.matchResult
          ? resolveMatchResult(store, user, input.matchResult, buildSavingRunEvidence(input))
          : undefined;
        const run = {
          id: nextId('run'),
          userId: user.id,
          date: input.date,
          distanceKm: input.distanceKm,
          pace: input.pace,
          durationSeconds: input.durationSeconds,
          ...(typeof input.cadenceSpm === 'number' ? { cadenceSpm: input.cadenceSpm } : {}),
          ...(typeof input.elevationGainM === 'number' ? { elevationGainM: input.elevationGainM } : {}),
          route: clone(input.route),
          startedAt: input.startedAt,
          endedAt: input.endedAt,
          ...(resolvedMatchResult ? { matchResult: clone(resolvedMatchResult) } : {}),
          // 레이스 이벤트 완주 보상(815런): formedMatchId가 가리키는 이벤트 + 내구 로스터
          // 참가 + 공표 거리 완주일 때만 박제. points.mjs가 파생 합산한다 (chase와 동일 구조).
          ...(() => {
            const raceEvent = resolveRaceEventCompletionStamp(store, user.id, {
              matchId: resolvedMatchResult?.matchId,
              distanceKm: input.distanceKm,
            });
            return raceEvent ? { raceEvent } : {};
          })(),
          // 경찰과 도둑런: 경기장 태그 + 정산 결과(bonusPoints/events)가 여기 박제되고,
          // points.mjs가 경쟁 러닝 재계산에 합산한다 (지급 함수 없음 — 매치 보너스와 동일 구조).
          ...(input.chaseArenaId
            ? {
                chase: {
                  arenaId: input.chaseArenaId,
                  arenaName: findChaseArena(input.chaseArenaId)?.name ?? '',
                  bonusPoints: 0,
                  events: [],
                },
              }
            : {}),
          source: 'RunningGround',
          sourceType: 'runningground',
          createdAt: nowIso(),
        };

        store.runs.push(run);

        // 경찰과 도둑런: 러닝이 저장되는 순간 경기장 슬롯을 반납한다 — 정산(chaseSettlement)의
        // 조기 리턴 경로(차량 판정, 경로 부족)는 반납까지 도달하지 않으므로 여기가 단일 보장점.
        // 정산 쪽 반납은 idempotent한 이중 안전망으로 남는다.
        if (run.chase?.arenaId) {
          releaseChasePresenceForUser(store, user.id, run.chase.arenaId);
        }

        // Anti-cheat V1 stage 2 (lib/runIntegrity.mjs): classify the just-saved run BEFORE the
        // metrics recompute below so a vehicle-flagged run never mints competitive points, and
        // revoke this user's already-applied match LP when the verdict is 'vehicle'. Never
        // throws — a bug in the integrity logic degrades to an un-flagged save.
        applyRunIntegrityCheck({ store, user, run, nowIso });

        // 이 저장이 매치의 마지막 조각이었을 수 있다 — 먼저 저장해서 PENDING으로 굳어 있던
        // 상대(주로 먼저 완주한 승자)의 블롭을 여기서 확정 판정으로 승격시킨다.
        healMatchCounterparts({
          backFillMatchCounterparts,
          store,
          matchResult: run.matchResult,
          invalidateUserMetrics,
        });

        // The verdict resolver above may have read (and cached) this user's metrics before the
        // run was pushed; drop that stale entry so the recompute includes the new run's bonus.
        invalidateUserMetrics(store, user.id);
        const metrics = getUserMetrics(store, user.id);
        return buildRunDetail(run, metrics.currentWeekDistanceKm, undefined, metrics);
      });

      // #209: the dedupe-retry paths above build their payload from a run whose route lives in
      // the run_routes side table (postgres driver), so the sync mutator could not attach it.
      // Re-attach here — in buildRunDetail's canonical key position — so a retried save answers
      // with exactly the same run detail shape as the original. The fresh-insert path already
      // carries its embedded input route, and the json driver's stored runs stay embedded, so
      // this only fires when the route is genuinely missing from the payload.
      if (payload?.run && payload.run.id && payload.run.route === undefined) {
        const storedRoute = await getStoredRunRoute(payload.run.id);

        if (Array.isArray(storedRoute)) {
          return {
            ...payload,
            run: attachRouteToRunPayload(payload.run, storedRoute),
          };
        }
      }

      return payload;
    },

    async queueIntegrationImports({ token, sourceType, normalizedRuns }) {
      return mutateStore((store) => {
        const user = requireUserByToken(store, token);
        const source = requireSyncableConnectedSource(user, sourceType, createError);
        const queue = ensureIntegrationImports(store);
        const receivedAt = nowIso();

        normalizedRuns.forEach((run) => {
          queue.push({
            id: nextId('import'),
            userId: user.id,
            ...run,
            receivedAt,
          });
        });

        return {
          success: true,
          source: decorateIntegrationSource(store, user, source),
          queuedRuns: normalizedRuns.length,
          pendingRuns: getPendingImportCount(store, user.id, sourceType),
        };
      });
    },

    async syncIntegrationImports({ token }) {
      return mutateStore((store) => {
        const user = requireUserByToken(store, token);
        return importPendingRunsForUser(store, user, {
          nextId,
          formatTimestamp,
          nowIso,
          sourceLabels,
        });
      });
    },
  };
}
