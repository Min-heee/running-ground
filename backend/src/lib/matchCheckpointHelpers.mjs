import {
  MATCH_CHECKPOINT_MAX,
  MATCH_CHECKPOINT_STEP_SECONDS,
} from './matchConstants.mjs';

// CHECKPOINT-FAIR LIVE COMPARE (2026-07-09) — PURE helpers so the write path (append) and the
// read path (latest-common-checkpoint) are unit-testable in isolation. Both are side-effect
// free: appendCheckpointSample returns a NEW array (never mutates its input) and
// resolveCommonCheckpoint only reads. The 10s grid is 4x coarser than the 2.5s client push
// cadence, so every index k=floor(elapsedSeconds/10) is backed by ~4 pushes the server already
// receives — no client protocol change. The index encodes the grid time T=(k+1)*10, so no
// per-entry timestamp is stored: `checkpoints` is a compact number[] of distanceKm at 2dp.

function toGridIndex(elapsedSeconds) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    return -1;
  }

  return Math.floor(elapsedSeconds / MATCH_CHECKPOINT_STEP_SECONDS);
}

// The grid time (seconds) that a filled index maps to. Index k is stamped once the runner has
// crossed T=(k+1)*STEP of elapsed, so the common checkpoint's compared elapsed is (k+1)*STEP.
export function checkpointIndexToElapsedSeconds(index) {
  if (!Number.isInteger(index) || index < 0) {
    return 0;
  }

  return (index + 1) * MATCH_CHECKPOINT_STEP_SECONDS;
}

// The highest index actually filled in a checkpoints array (last non-undefined slot). Returns
// -1 for an empty/undefined/non-array input so callers read it as "no checkpoint yet".
export function highestFilledCheckpointIndex(checkpoints) {
  if (!Array.isArray(checkpoints)) {
    return -1;
  }

  for (let index = checkpoints.length - 1; index >= 0; index -= 1) {
    if (typeof checkpoints[index] === 'number' && Number.isFinite(checkpoints[index])) {
      return index;
    }
  }

  return -1;
}

// Append the (elapsedSeconds, distanceKm) sample onto the 10s grid, returning a NEW array.
//   - k = floor(elapsedSeconds / STEP); the sample lands at index k.
//   - BACKFILL: any gap between the last filled index and k is filled with the last known
//     distance (the distance carried by the previous fill), so a screen-off gap — a push at
//     elapsed=27 then 52 filling k=2..5 — does not stall the common index. The NEW sample's
//     distance is written only at k itself.
//   - LAST-WRITE-WINS within a 10s window: a later push in the same bucket overwrites k
//     (distance is already monotonic upstream via normalizeRunningMatchProgress).
//   - CAP: the array never grows past MATCH_CHECKPOINT_MAX indices.
//   - NO-OP GUARDS: a non-finite/negative elapsed or distance, or an index at/after the cap,
//     returns the input array UNCHANGED (referentially, so the caller's no-change store-skip is
//     preserved). A time-only backfill push that carried no distance advance is the caller's
//     responsibility to skip (it must not call this without a real distance).
export function appendCheckpointSample(checkpoints, elapsedSeconds, distanceKm) {
  const source = Array.isArray(checkpoints) ? checkpoints : [];

  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    return source;
  }

  const index = toGridIndex(elapsedSeconds);

  if (index < 0 || index >= MATCH_CHECKPOINT_MAX) {
    return source;
  }

  const roundedDistanceKm = Number(distanceKm.toFixed(2));
  const lastFilled = highestFilledCheckpointIndex(source);

  if (index <= lastFilled && source[index] === roundedDistanceKm) {
    // No-change re-push inside an already-filled bucket — hand back the same reference so the
    // store's whole-blob no-change serialize skip is not defeated by a fresh array identity.
    return source;
  }

  const next = source.slice();

  // Backfill the gap [lastFilled+1 .. index-1] with the last known distance so the common
  // index advances through a bucket the runner skipped (screen-off / background gap).
  if (lastFilled >= 0) {
    const lastKnownDistanceKm = source[lastFilled];
    for (let fill = lastFilled + 1; fill < index; fill += 1) {
      next[fill] = lastKnownDistanceKm;
    }
  }

  next[index] = roundedDistanceKm;

  return next;
}

// LATEST COMMON CHECKPOINT — the coarse grid index BOTH sides can be compared at fairly.
//   - commonMaxIndex = MIN highest-filled index over the ACTIVE set only (running/hasProgress).
//     Finished/forfeited/disconnected runners are EXCLUDED so one stale runner cannot pin
//     everyone low (a finisher stops sampling; their last index would otherwise freeze the min).
//   - commonT = the grid seconds for that index; distanceByUserId maps each ACTIVE runner to its
//     checkpoints[commonMaxIndex].
//   - EMPTY signal: commonMaxIndex = -1 when no runner is active or any active runner has no
//     checkpoint yet — the caller then falls back to the legacy projectOfficialDistanceKm path.
// `participants` items are shaped { userId, checkpoints, isActive } — the caller decides
// activeness (running/background + hasProgress) so this helper stays free of status semantics.
export function resolveCommonCheckpoint(participants) {
  const empty = { commonMaxIndex: -1, commonT: 0, distanceByUserId: new Map() };

  if (!Array.isArray(participants) || participants.length === 0) {
    return empty;
  }

  const active = participants.filter((participant) => participant && participant.isActive);

  if (active.length === 0) {
    return empty;
  }

  let commonMaxIndex = Number.POSITIVE_INFINITY;

  for (const participant of active) {
    const highest = highestFilledCheckpointIndex(participant.checkpoints);

    if (highest < 0) {
      // An active runner with no checkpoint yet means there is no COMMON index — bail to the
      // fallback so the compare is never anchored on an empty side (no fake 0.00 gap).
      return empty;
    }

    if (highest < commonMaxIndex) {
      commonMaxIndex = highest;
    }
  }

  if (!Number.isFinite(commonMaxIndex) || commonMaxIndex < 0) {
    return empty;
  }

  const distanceByUserId = new Map();

  for (const participant of active) {
    const distanceKm = participant.checkpoints[commonMaxIndex];

    if (typeof distanceKm === 'number' && Number.isFinite(distanceKm)) {
      distanceByUserId.set(participant.userId, distanceKm);
    }
  }

  return {
    commonMaxIndex,
    commonT: checkpointIndexToElapsedSeconds(commonMaxIndex),
    distanceByUserId,
  };
}
