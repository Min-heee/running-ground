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

function buildIntegrityLogLine(user, run, verdict) {
  const distance = Number(run.distanceKm);
  const duration = Number(run.durationSeconds);
  const avgSpeedMps = Number.isFinite(distance) && Number.isFinite(duration) && duration > 0
    ? ((distance * 1000) / duration).toFixed(2)
    : 'n/a';
  const cadence = typeof run.cadenceSpm === 'number' && Number.isFinite(run.cadenceSpm)
    ? run.cadenceSpm
    : 'null';

  return `[run-integrity] userId=${user.id} runId=${run.id} verdict=${verdict} `
    + `speedMps=${avgSpeedMps} cadenceSpm=${cadence} distanceKm=${run.distanceKm}`;
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

// Retroactive LP revocation for a vehicle-classified official-match run: reverse exactly
// this user's applied delta via applyLpDelta with the negated value, so the reversal
// inherits the exact clamp semantics every other LP mutation uses (demotion borrows
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

  if (appliedDelta === null || appliedDelta === 0) {
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

    const verdict = classifyRunIntegrity({
      distanceKm: run.distanceKm,
      durationSeconds: run.durationSeconds,
      cadenceSpm: run.cadenceSpm,
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
      checkedAt: previousIntegrity?.checkedAt ?? nowIso(),
    };

    console.log(buildIntegrityLogLine(user, run, verdict));

    if (verdict === 'vehicle') {
      revokeAppliedMatchLp(store, user, run);
    }
  } catch (error) {
    console.error(`[run-integrity] check failed — run saved un-flagged: ${error?.message ?? error}`);
  }
}
