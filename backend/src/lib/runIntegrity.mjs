// Anti-cheat V1 stage 2 — vehicle detection at tracked-run save time.
//
// WHY save time: competitive entry already requires motion permission (stage 1, the client
// preflight), so every competitive run carries a REAL whole-run average cadence — but that
// cadence only reaches the server on POST /api/runs/tracked (the match finish push carries
// no motion signal), AFTER the match verdict + LP were sealed on the progress path. This
// check therefore classifies at run save and acts RETROACTIVELY on the already-applied LP.
//
// Deliberate scope guardrails:
//   - The OPPONENT's LP and the match verdict itself are NOT touched here. Reversing the
//     whole match (opponent compensation, verdict flip, result notifications) is the
//     stage-3 follow-up; stage 2 only takes back what THIS user gained and bars the run
//     from competitive surfaces (lib/competitiveRuns.mjs isCompetitiveRun).
//   - 'suspect' is telemetry-only (one structured log line) for post-launch threshold
//     calibration — no punishment, no competitive exclusion.
//   - A bug in this module must NEVER cost a runner their run: applyRunIntegrityCheck
//     catches everything and degrades to saving the run un-flagged, because losing a
//     user's run is worse than missing a cheater.
//
// Storage: run.integrity rides the run record inside the whole-store blob, which BOTH live
// store drivers persist as-is (json file; postgres app_store jsonb — postgresStoreAdapter
// extracts only `route` into the run_routes side table and keeps every other run field), so
// no schema change is needed. CAVEAT for the Postgres-primary migration (createPostgres-
// RunsRepository is not wired into server.mjs yet): the relational runs table maps explicit
// columns only (postgresRunsQueries insertRun + the enumerated SELECTs + postgresRunsRow-
// Mappers mapRunRow silently drop unknown fields), so when that path goes live it must add
// an `integrity` jsonb column end-to-end (db/schema.sql, insertRun, every runs SELECT,
// mapRunRow, db/migrate-json-to-postgres.mjs) or vehicle flags will be lost on round-trip.
// (run.cadenceAudit already has its `cadence_audit` jsonb column on that path.)
//
// ── 케이던스 워치독 (오너 규칙 2026-09-09) ────────────────────────────────────────────
// 달리기 속도로 이동하는데 케이던스가 안 찍히면 1차 경고, 2차면 부정 러닝 — 매치는 실격패
// (포인트 0), 솔로는 정지+기록 삭제. 판정 코어는 클라이언트(src/features/runs/integrity/
// cadenceWatchdogModel.ts)에 있고, 저장 페이로드의 run.cadenceAudit 원장이 여기로 온다:
//   { sensorAvailable, foregroundMovingSeconds, foregroundSteps, strikes, disqualified }
// 서버는 두 갈래로 쓴다.
//   1. cadenceAudit.disqualified === true → 'vehicle' (reason 'cadence-watchdog'). 자진 신고다:
//      신고한 본인만 손해 보므로(포인트 0·보드 제외) 위조 유인이 없다.
//   2. 백스톱 (reason 'cadence-audit'): 센서가 있고, 클라 워치독이 이미 최소 1차 경고를 했고
//      (strikes ≥ 1), 포그라운드 달리기 속도 이동이 3분 이상 쌓였는데 그 동안의 걸음이 20 spm
//      미만이면 'vehicle'. 보수적으로 잡는 이유는 두 가지다 (적대 리뷰 2026-09-09):
//        - 오너 규칙이 벌하는 건 케이던스 '미등록'이다. 30-45 spm을 세는 폰은 케이던스를
//          등록하고 있는 것이고(언더카운트든 느린 조깅이든), 그건 워치독이 경고하는 상태가
//          아니다 — 차량 서명은 거치된 폰의 ~0-20 spm 대역뿐이다.
//        - 서버가 클라이언트가 한 번도 경고하지 않은 러너를 조용히 실격시키면 안 된다.
//          스트라이크 게이트가 "이 러너는 이미 경고 화면을 봤다"를 보장한다.
//      절대 "케이던스가 없다"는 사실만으로 유죄를 주지 않는다 — 안드로이드 expo-sensors는
//      백그라운드에서 걸음 센서를 해제하므로(SensorProxy.onHostPause → stopObserving) 화면 끈
//      갤럭시 런은 케이던스가 통째로 비고, 그건 클라이언트가 포그라운드 창만 원장에 쌓는
//      이유이기도 하다. 원장이 없거나 모양이 깨졌으면 백스톱은 침묵한다.
// 기존 평균 속도 규칙은 그대로(reason 'speed'). run.integrity = { verdict, reason?, checkedAt,
// lpRevoked? } — reason은 vehicle 판정에만 찍는다.

import { applyLpDelta } from './rankSystem.mjs';

// ── Classification thresholds ─────────────────────────────────────────────────────────────
//
// Calibration points (from the tracking pipeline's own fixtures/constants,
// src/features/runs/tracking): real running averages ~130-175 spm over a whole run ("real
// slow jog" 133, real iPhone run 154); continuous walking ~100-115 spm; cycling feet never
// strike so a mounted phone reads ~0-30 spm; and the client already nulls a dead/denied
// sensor (<30 spm over >60s saves cadenceSpm: null), so a saved NUMBER means the sensor
// genuinely produced steps.
//
// FALSE-POSITIVE analysis behind splitting the punitive floor (40) from the telemetry
// ceiling (90): the pedometer subscription undercounts real steps on two known paths —
// pause/resume resets the step offset so the running total can snap DOWN mid-run, and
// screen-off Android FG-service stretches keep accruing GPS distance while the JS step
// callback sleeps. Either can roughly HALVE a genuine ~160 spm average to ~80 spm, so
// 40-90 spm at running speed must stay unpunished ('suspect', telemetry only). An average
// that degrades below 40 while step data exists at all is not a runner on any known
// undercount path — that is the mounted-phone vehicle signature.

// Runs shorter than this are never classified: sub-500m records are dominated by GPS
// cold-start noise and cannot meaningfully separate a sprint from a bus hop.
export const MIN_CLASSIFIABLE_DISTANCE_KM = 0.5;

// Faster than 2:59/km sustained — beyond world-class RACE pace, but a fit runner CAN
// hold it for a short all-out effort (the app allows 0.5km duels, and 500m in <90s is
// trained-amateur territory). So the 5.6 rule alone only convicts from
// VEHICLE_SPEED_MIN_DISTANCE_KM up; short runs need the higher outright-impossible bar.
export const VEHICLE_SPEED_MPS = 5.6;

// Distance from which sustaining >VEHICLE_SPEED_MPS is impossible for any human
// (1.5km at 2:59/km pace ≈ a world-record-adjacent effort no app user produces).
export const VEHICLE_SPEED_MIN_DISTANCE_KM = 1.5;

// Short-run outright-impossible bar: >7.0 m/s (2:23/km) average over even 500m is
// sprint-world-record territory — no cadence reading can excuse it.
export const SHORT_RUN_VEHICLE_SPEED_MPS = 7.0;

// ~6:57/km — the floor of "moving at running speed". At or below this the record is
// walk-compatible and cadence proves nothing (phone in a bag on a stroll), so no verdict
// fires no matter how low the cadence reads.
export const RUNNING_SPEED_FLOOR_MPS = 2.4;

// Telemetry-only gray-zone ceiling: running speed with null cadence or an average under
// ~90 spm is logged as 'suspect' for post-launch calibration. Covers the undercount paths
// above plus permission-less solo runs (which save cadenceSpm: null).
//
// LAUNCH DECISION — cadence alone never convicts (verified 2026-07-12): the mounted-phone
// vehicle signature (~0-30 spm) is NULLED client-side before it ever reaches the server,
// while the pause/resume step-offset reset and Android screen-off stretches can push a
// REAL run's saved average into the 30-40 band — so a punitive cadence floor would catch
// more runners than cheaters. The offset bug is fixed client-side in the same batch;
// once post-launch telemetry over 'suspect' rows confirms the band is clean, a punitive
// floor can be re-armed here as stage 3.
export const SUSPECT_CADENCE_CEILING_SPM = 90;

// 케이던스 감사 백스톱 문턱: 포그라운드 달리기 속도 이동이 이만큼 쌓여야 판정한다. 워치독
// 창(90초) 둘을 연달아 놓쳤을 분량이라, 클라 워치독이 깨어 있었다면 이미 실격했을 길이다.
export const CADENCE_AUDIT_MIN_MOVING_SECONDS = 180;

// 포그라운드 달리기 속도 이동 동안의 걸음/분이 이 아래면 차량 서명 — 거치된 폰의 near-zero
// 대역(~0-20 spm). 저장 시 평균 규칙의 처벌 바닥(40)보다 일부러 낮다: 30-45 spm을 세는 폰은
// 케이던스를 '등록'하고 있고, 오너 규칙이 벌하는 건 미등록이다 (적대 리뷰 2026-09-09).
export const CADENCE_AUDIT_VEHICLE_SPM = 20;

// 백스톱이 판정하려면 클라 워치독이 마지막 창에서 이미 이만큼 경고했어야 한다. 서버가 한 번도
// 경고받지 않은 러너를 조용히 실격시키는 일이 없도록 — 백스톱은 워치독이 "경고까지 했는데
// 2차 판정을 못 내린" 런(앱 종료·저장 직행)을 마무리하는 장치지, 독립 판정기가 아니다.
export const CADENCE_AUDIT_MIN_STRIKES = 1;

// 보폭 상한 (오너 확정 2026-09-10) — 클라 워치독과 같은 값. 걸음은 찍히는데 그 걸음으로 갈 수
// 없는 거리를 갔으면 자전거·킥보드다. 실측: 4:00/km에서 80spm → 보폭 3.1m. 사람의 달리기
// 보폭은 0.8~1.8m, 3:00/km를 180spm으로 뛰는 최상급도 1.85m라 2.2m는 넉넉한 여유선이다.
// **이 판정은 실격이 아니다** — 걸음을 적게 세는 폰(유모차·거치대)도 넘을 수 있으므로 기록은
// 남기고 랭킹·포인트·별에서만 뺀다(vehicle 판정의 기존 의미). 실격은 근제로 대역 전용이다.
export const CADENCE_STRIDE_MAX_METERS = 2.2;

// 보폭 판정에 필요한 최소 포그라운드 달리기 속도 이동 — 창(90초) 하나 분량. GPS 초반 잡음과
// 짧은 구간의 우연을 배제한다.
export const CADENCE_STRIDE_MIN_MOVING_SECONDS = 90;

export const INTEGRITY_REASON_SPEED = 'speed';
export const INTEGRITY_REASON_CADENCE_WATCHDOG = 'cadence-watchdog';
export const INTEGRITY_REASON_CADENCE_AUDIT = 'cadence-audit';
export const INTEGRITY_REASON_CADENCE_STRIDE = 'cadence-stride';

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

// 원장 모양 검증 — 라우트 validator가 이미 거르지만, 리포지토리는 검증 없는 입력도 받으므로
// 여기서도 한 번 더 본다. 깨진 원장은 null: 백스톱이 침묵하고 자진 신고도 무시된다.
export function normalizeCadenceAudit(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const {
    sensorAvailable,
    foregroundMovingSeconds,
    foregroundSteps,
    foregroundMovingMeters,
    suspectedNonRunning,
    strikes,
    disqualified,
  } = raw;

  if (
    typeof sensorAvailable !== 'boolean'
    || typeof disqualified !== 'boolean'
    || !isNonNegativeInteger(foregroundMovingSeconds)
    || !isNonNegativeInteger(foregroundSteps)
    || !isNonNegativeInteger(strikes)
  ) {
    return null;
  }

  // 보폭 필드는 2026-09-10 이후 앱만 보낸다 — 없거나 모양이 깨졌으면 그 판정만 침묵하고
  // 나머지 원장은 그대로 쓴다(옛 앱의 저장이 통째로 무시되면 안 된다).
  return {
    sensorAvailable,
    foregroundMovingSeconds,
    foregroundSteps,
    ...(isNonNegativeInteger(foregroundMovingMeters) ? { foregroundMovingMeters } : {}),
    ...(typeof suspectedNonRunning === 'boolean' ? { suspectedNonRunning } : {}),
    strikes,
    disqualified,
  };
}

// 보폭 판정: 클라가 래치한 자진 신고(suspectedNonRunning)를 우선 믿고, 없으면 원장으로 직접
// 계산한다. 자진 신고는 본인만 손해라 위조 유인이 없고, 직접 계산은 옛 원장·깨진 래치의 백스톱.
export function classifyCadenceStride(rawCadenceAudit) {
  const audit = normalizeCadenceAudit(rawCadenceAudit);

  if (!audit || !audit.sensorAvailable) {
    return 'clear';
  }

  if (audit.suspectedNonRunning === true) {
    return 'vehicle';
  }

  if (
    !isNonNegativeInteger(audit.foregroundMovingMeters)
    || audit.foregroundSteps <= 0
    || audit.foregroundMovingSeconds < CADENCE_STRIDE_MIN_MOVING_SECONDS
  ) {
    return 'clear';
  }

  return audit.foregroundMovingMeters / audit.foregroundSteps > CADENCE_STRIDE_MAX_METERS
    ? 'vehicle'
    : 'clear';
}

// 백스톱 단독 판정: 센서가 있고, 워치독 경고(strikes)가 최소 1회 있고, 포그라운드 달리기 속도
// 이동이 문턱 이상인데 그 동안의 spm이 near-zero 바닥 미만이면 'vehicle', 아니면 'clear'.
// 자진 신고(disqualified)는 보지 않는다.
export function classifyCadenceAudit(rawCadenceAudit) {
  const audit = normalizeCadenceAudit(rawCadenceAudit);

  if (
    !audit
    || !audit.sensorAvailable
    || audit.strikes < CADENCE_AUDIT_MIN_STRIKES
    || audit.foregroundMovingSeconds < CADENCE_AUDIT_MIN_MOVING_SECONDS
  ) {
    return 'clear';
  }

  const foregroundSpm = (audit.foregroundSteps / audit.foregroundMovingSeconds) * 60;
  return foregroundSpm < CADENCE_AUDIT_VEHICLE_SPM ? 'vehicle' : 'clear';
}

// 저장 시점의 전체 판정 — { verdict, reason }. reason은 vehicle에만 붙는다.
// 우선순위: 자진 신고(클라가 이미 실격 화면을 보여줬다) → 서버 자체 속도 규칙(가장 단단한
// 증거) → 케이던스 백스톱 → 속도/케이던스 회색지대(suspect) → clear.
export function resolveRunIntegrityVerdict({ distanceKm, durationSeconds, cadenceSpm, cadenceAudit } = {}) {
  const audit = normalizeCadenceAudit(cadenceAudit);

  if (audit?.disqualified === true) {
    return { verdict: 'vehicle', reason: INTEGRITY_REASON_CADENCE_WATCHDOG };
  }

  const speedVerdict = classifyRunIntegrity({ distanceKm, durationSeconds, cadenceSpm });

  if (speedVerdict === 'vehicle') {
    return { verdict: 'vehicle', reason: INTEGRITY_REASON_SPEED };
  }

  if (classifyCadenceAudit(audit) === 'vehicle') {
    return { verdict: 'vehicle', reason: INTEGRITY_REASON_CADENCE_AUDIT };
  }

  // 걸음은 찍혔지만 그 걸음으로 갈 수 없는 거리 — 자전거·킥보드. 실격은 없고 집계에서만 뺀다.
  if (classifyCadenceStride(audit) === 'vehicle') {
    return { verdict: 'vehicle', reason: INTEGRITY_REASON_CADENCE_STRIDE };
  }

  return { verdict: speedVerdict };
}

// Pure classifier over the three save-time signals. Returns 'vehicle' | 'suspect' | 'clear'
// and never throws on garbage input (non-finite/zero guards resolve to 'clear').
export function classifyRunIntegrity({ distanceKm, durationSeconds, cadenceSpm } = {}) {
  const distance = Number(distanceKm);
  const duration = Number(durationSeconds);

  if (
    !Number.isFinite(distance)
    || !Number.isFinite(duration)
    || duration <= 0
    || distance < MIN_CLASSIFIABLE_DISTANCE_KM
  ) {
    return 'clear';
  }

  const avgSpeedMps = (distance * 1000) / duration;

  if (!Number.isFinite(avgSpeedMps) || avgSpeedMps <= 0) {
    return 'clear';
  }

  if (
    avgSpeedMps > SHORT_RUN_VEHICLE_SPEED_MPS
    || (avgSpeedMps > VEHICLE_SPEED_MPS && distance >= VEHICLE_SPEED_MIN_DISTANCE_KM)
  ) {
    return 'vehicle';
  }

  if (avgSpeedMps <= RUNNING_SPEED_FLOOR_MPS) {
    return 'clear';
  }

  const cadence = typeof cadenceSpm === 'number' && Number.isFinite(cadenceSpm) ? cadenceSpm : null;

  // A short-run 5.6-7.0 m/s effort also lands here: flagged, never auto-punished.
  if (cadence === null || cadence < SUSPECT_CADENCE_CEILING_SPM || avgSpeedMps > VEHICLE_SPEED_MPS) {
    return 'suspect';
  }

  return 'clear';
}

function buildIntegrityLogLine(user, run, verdict, reason) {
  const distance = Number(run.distanceKm);
  const duration = Number(run.durationSeconds);
  const avgSpeedMps = Number.isFinite(distance) && Number.isFinite(duration) && duration > 0
    ? ((distance * 1000) / duration).toFixed(2)
    : 'n/a';
  const cadence = typeof run.cadenceSpm === 'number' && Number.isFinite(run.cadenceSpm)
    ? run.cadenceSpm
    : 'null';
  const audit = normalizeCadenceAudit(run.cadenceAudit);
  const auditSummary = audit
    ? `fgMovingS=${audit.foregroundMovingSeconds} fgSteps=${audit.foregroundSteps} strikes=${audit.strikes}`
      + ` sensor=${audit.sensorAvailable} dq=${audit.disqualified}`
      + ` fgMovingM=${audit.foregroundMovingMeters ?? 'n/a'} stride=${
        isNonNegativeInteger(audit.foregroundMovingMeters) && audit.foregroundSteps > 0
          ? (audit.foregroundMovingMeters / audit.foregroundSteps).toFixed(2)
          : 'n/a'
      } suspect=${audit.suspectedNonRunning ?? 'n/a'}`
    : 'audit=none';

  return `[run-integrity] userId=${user.id} runId=${run.id} verdict=${verdict}`
    + `${reason ? ` reason=${reason}` : ''} `
    + `speedMps=${avgSpeedMps} cadenceSpm=${cadence} distanceKm=${run.distanceKm} ${auditSummary}`;
}

// Sum THIS user's applied LP for the match. The durable per-user LP bookkeeping is the
// rank_change notification appended next to every LP apply (matchActionHandlers
// appendRankChangeNotification, data = { matchId, lpDelta, … }): the live session never
// records per-user deltas and may already be pruned by save time, so — following the
// correct-duel-2026-07-04 retro-correction precedent — the notification IS the source of
// truth for "was LP applied, and by how much". Returns null when nothing was applied
// (including a fully floor-clamped no-op apply, which appends no notification).
function sumAppliedMatchLpDelta(store, userId, matchId) {
  const notifications = Array.isArray(store?.notifications) ? store.notifications : [];
  let total = 0;
  let found = false;

  for (const notification of notifications) {
    if (
      notification?.userId === userId
      && notification?.type === 'rank_change'
      && notification?.data?.matchId === matchId
      && Number.isFinite(Number(notification.data.lpDelta))
    ) {
      total += Math.trunc(Number(notification.data.lpDelta));
      found = true;
    }
  }

  return found ? total : null;
}

// Retroactive LP revocation for a vehicle-classified official-match run: take back exactly
// the LP this user GAINED from the match via applyLpDelta with the negated value, so the
// reversal inherits the exact clamp semantics every other LP mutation uses (demotion borrows
// LP_PER_TIER per tier crossed; hard floor at 입문 0 LP). Known accepted edge: if the
// ORIGINAL apply was clamped at that floor, the negated reversal is not perfectly
// symmetric — rare, small, and bounded by a single delta.
//
// Idempotency: run.integrity.lpRevoked (the reversed delta) marks the reversal on the run
// row itself, and the match-save dedupe collapses retries onto that same row, so a
// duplicate save/retry can never double-revoke. When LP has NOT been applied yet at save
// time (the opponent is still running), nothing is revoked NOW — the duel/group reconcile
// flow re-saves this run to upgrade its PENDING verdict once the opponent lands, and that
// re-save retries the revocation against the by-then-appended rank_change marker.
//
// 양수 델타만 회수한다 — 모든 vehicle 사유에서 (적대 리뷰 2026-09-09). 예전에는 속도 규칙과
// 케이던스 백스톱이 델타 부호와 무관하게 "그 매치의 LP 변동을 전부 되돌렸다" — 즉 차량 판정을
// 받은 패자는 자기 패배 LP를 돌려받았다. 부정 러닝 판정이 그 러너에게 환급이 되면 안 된다:
// 진 매치는 진 매치고(실격패·기권패와 같은 패배), 회수 대상은 이 러너가 그 매치에서 '얻은'
// 것뿐이다. 그래서 사유('speed' / 'cadence-watchdog' / 'cadence-audit')를 가리지 않고 음수
// 델타는 손대지 않는다. 자진 신고를 이긴 매치에 얹은 위조(양수 델타)는 여전히 회수된다 —
// 자진 신고는 신고한 본인만 손해 봐야 하므로. 상대의 LP와 매치 판정은 여전히 여기서 건드리지
// 않는다(stage-3).
function revokeAppliedMatchLp(store, user, run) {
  if (Number.isFinite(run.integrity?.lpRevoked)) {
    return;
  }

  const matchId = typeof run.matchResult?.matchId === 'string' && run.matchResult.matchId
    ? run.matchResult.matchId
    : null;

  if (!matchId) {
    return;
  }

  const appliedDelta = sumAppliedMatchLpDelta(store, user.id, matchId);

  // null = 아직 적용 전(재저장에서 재시도), 0 이하 = 이 매치에서 얻은 게 없다(패배 LP는 남는다).
  if (appliedDelta === null || appliedDelta <= 0) {
    return;
  }

  const nextRankState = applyLpDelta(user.rankState, -appliedDelta);
  user.rankState = { tier: nextRankState.tier, lp: nextRankState.lp };
  run.integrity.lpRevoked = appliedDelta;

  console.log(
    `[run-integrity] lp-revoked userId=${user.id} runId=${run.id} matchId=${matchId} `
    + `revokedDelta=${appliedDelta} rank=${nextRankState.tier}/${nextRankState.lp}`,
  );
}

// The applier the tracked-run save path calls with the store, the saving user and the run
// row all in hand (json runs repository, inside mutateStore — runs on BOTH store drivers).
// Stamps run.integrity for non-clear verdicts and revokes applied LP for 'vehicle'. Must be
// called BEFORE the post-save metrics recompute so a vehicle run never mints competitive
// points. NEVER throws: any bug in the integrity logic degrades to an un-flagged save.
export function applyRunIntegrityCheck({ store, user, run, nowIso = () => new Date().toISOString() }) {
  try {
    if (!run || typeof run !== 'object' || run.sourceType !== 'runningground'
      || !user || typeof user !== 'object') {
      return;
    }

    const { verdict, reason } = resolveRunIntegrityVerdict({
      distanceKm: run.distanceKm,
      durationSeconds: run.durationSeconds,
      cadenceSpm: run.cadenceSpm,
      cadenceAudit: run.cadenceAudit,
    });

    if (verdict === 'clear') {
      return;
    }

    // Keep the first checkedAt (and any lpRevoked marker) across retried saves — the
    // classification inputs are immutable after save, so the verdict can never change.
    const previousIntegrity = run.integrity && typeof run.integrity === 'object' ? run.integrity : null;
    run.integrity = {
      ...(previousIntegrity ?? {}),
      verdict,
      ...(reason ? { reason } : {}),
      checkedAt: previousIntegrity?.checkedAt ?? nowIso(),
    };

    console.log(buildIntegrityLogLine(user, run, verdict, reason));

    if (verdict === 'vehicle') {
      revokeAppliedMatchLp(store, user, run);
    }
  } catch (error) {
    console.error(`[run-integrity] check failed — run saved un-flagged: ${error?.message ?? error}`);
  }
}
