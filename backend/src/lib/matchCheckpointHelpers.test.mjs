import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MATCH_CHECKPOINT_MAX,
  MATCH_CHECKPOINT_STEP_SECONDS,
} from './matchConstants.mjs';
import {
  appendCheckpointSample,
  checkpointIndexToElapsedSeconds,
  highestFilledCheckpointIndex,
  resolveCommonCheckpoint,
} from './matchCheckpointHelpers.mjs';

// ---- appendCheckpointSample ----

test('appendCheckpointSample: index math — k = floor(elapsed/10), distance lands at k', () => {
  // elapsed 34 → k=3 → checkpoints[3] set, earlier indices backfilled from nothing = undefined.
  const result = appendCheckpointSample([], 34, 1.2);
  assert.equal(result[3], 1.2);
  assert.equal(result.length, 4);
  // No earlier fill existed, so 0..2 stay holes (highest filled is 3).
  assert.equal(highestFilledCheckpointIndex(result), 3);
});

test('appendCheckpointSample: sequential pushes fill the grid at the right indices', () => {
  let checkpoints = [];
  checkpoints = appendCheckpointSample(checkpoints, 10, 0.05); // k=1
  checkpoints = appendCheckpointSample(checkpoints, 20, 0.5); // k=2 (surge)
  assert.equal(checkpoints[1], 0.05);
  assert.equal(checkpoints[2], 0.5);
});

test('appendCheckpointSample: backfill across a screen-off gap (27 then 52 → fills k=2..5)', () => {
  let checkpoints = [];
  // elapsed 27 → k=2, distance 0.3
  checkpoints = appendCheckpointSample(checkpoints, 27, 0.3);
  assert.equal(checkpoints[2], 0.3);
  assert.equal(highestFilledCheckpointIndex(checkpoints), 2);

  // elapsed 52 → k=5, distance 0.9. The gap k=3,4 must backfill with the last known 0.3 so the
  // common index advances; k=5 carries the new distance.
  checkpoints = appendCheckpointSample(checkpoints, 52, 0.9);
  assert.equal(checkpoints[3], 0.3, 'k=3 backfilled with last known distance');
  assert.equal(checkpoints[4], 0.3, 'k=4 backfilled with last known distance');
  assert.equal(checkpoints[5], 0.9, 'k=5 carries the new sample');
  assert.equal(highestFilledCheckpointIndex(checkpoints), 5);
});

test('appendCheckpointSample: last-write-wins within a 10s window', () => {
  let checkpoints = [];
  // Two pushes inside the same bucket k=1 (elapsed 12 then 18) — the later distance wins.
  checkpoints = appendCheckpointSample(checkpoints, 12, 0.11);
  checkpoints = appendCheckpointSample(checkpoints, 18, 0.19);
  assert.equal(checkpoints[1], 0.19);
  assert.equal(highestFilledCheckpointIndex(checkpoints), 1);
});

test('appendCheckpointSample: MAX cap — an index at/after MATCH_CHECKPOINT_MAX is not stored', () => {
  const atCapElapsed = MATCH_CHECKPOINT_MAX * MATCH_CHECKPOINT_STEP_SECONDS; // k === MAX
  const result = appendCheckpointSample([], atCapElapsed, 42);
  // Index === MAX is out of range → returns the input unchanged (same reference).
  assert.equal(result.length, 0);
});

test('appendCheckpointSample: array never grows past MATCH_CHECKPOINT_MAX', () => {
  const lastValidElapsed = (MATCH_CHECKPOINT_MAX - 1) * MATCH_CHECKPOINT_STEP_SECONDS; // k = MAX-1
  const result = appendCheckpointSample([], lastValidElapsed, 21.1);
  assert.equal(result.length, MATCH_CHECKPOINT_MAX);
  assert.equal(result[MATCH_CHECKPOINT_MAX - 1], 21.1);
});

test('appendCheckpointSample: no-distance-advance / invalid distance is a no-op (same reference)', () => {
  const base = appendCheckpointSample([], 15, 0.5);
  // A push with a non-finite distance (time-only backfill sentinel) must not mutate the grid.
  const afterNaN = appendCheckpointSample(base, 25, Number.NaN);
  assert.equal(afterNaN, base, 'non-finite distance returns the SAME array reference');
  const afterNeg = appendCheckpointSample(base, 25, -1);
  assert.equal(afterNeg, base, 'negative distance returns the SAME array reference');
});

test('appendCheckpointSample: an identical re-push in a filled bucket returns the SAME reference', () => {
  const base = appendCheckpointSample([], 15, 0.5); // k=1 = 0.5
  const repush = appendCheckpointSample(base, 17, 0.5); // same bucket, same 2dp distance
  assert.equal(repush, base, 'no-change re-push preserves array identity (store no-change skip)');
});

test('appendCheckpointSample: distance is rounded to 2dp', () => {
  const result = appendCheckpointSample([], 10, 0.123456);
  assert.equal(result[1], 0.12);
});

test('checkpointIndexToElapsedSeconds: index k maps to (k+1)*STEP', () => {
  assert.equal(checkpointIndexToElapsedSeconds(0), MATCH_CHECKPOINT_STEP_SECONDS);
  assert.equal(checkpointIndexToElapsedSeconds(5), 6 * MATCH_CHECKPOINT_STEP_SECONDS);
  assert.equal(checkpointIndexToElapsedSeconds(-1), 0);
});

// ---- resolveCommonCheckpoint ----

test('resolveCommonCheckpoint: min over the active set', () => {
  const result = resolveCommonCheckpoint([
    { userId: 'a', checkpoints: [0.1, 0.2, 0.3, 0.4], isActive: true }, // highest = 3
    { userId: 'b', checkpoints: [0.1, 0.2], isActive: true }, // highest = 1
  ]);
  assert.equal(result.commonMaxIndex, 1);
  assert.equal(result.commonT, 2 * MATCH_CHECKPOINT_STEP_SECONDS);
  assert.equal(result.distanceByUserId.get('a'), 0.2);
  assert.equal(result.distanceByUserId.get('b'), 0.2);
});

test('resolveCommonCheckpoint: EXCLUDES a finished/forfeited/disconnected runner (isActive false)', () => {
  // The k=3 runner is inactive (finished) → excluded → common is the min over the active pair.
  const result = resolveCommonCheckpoint([
    { userId: 'a', checkpoints: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], isActive: true }, // 8
    { userId: 'b', checkpoints: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], isActive: true }, // 8
    { userId: 'stale', checkpoints: [0.1, 0.2, 0.3], isActive: false }, // 2 but EXCLUDED
  ]);
  assert.equal(result.commonMaxIndex, 8, 'the paused/finished k=3 runner does not pin everyone low');
  assert.equal(result.distanceByUserId.has('stale'), false, 'excluded runner absent from the distance map');
});

test('resolveCommonCheckpoint: a still-active low runner DOES pin the common index', () => {
  const result = resolveCommonCheckpoint([
    { userId: 'a', checkpoints: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], isActive: true }, // 8
    { userId: 'b', checkpoints: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], isActive: true }, // 8
    { userId: 'slow', checkpoints: [0.1, 0.2, 0.3, 0.4], isActive: true }, // 3 — still running
  ]);
  assert.equal(result.commonMaxIndex, 3);
  assert.equal(result.distanceByUserId.get('a'), 0.4);
  assert.equal(result.distanceByUserId.get('slow'), 0.4);
});

test('resolveCommonCheckpoint: empty → fallback signal (commonMaxIndex -1)', () => {
  assert.equal(resolveCommonCheckpoint([]).commonMaxIndex, -1);
  assert.equal(resolveCommonCheckpoint(undefined).commonMaxIndex, -1);
  // No active runner at all.
  assert.equal(resolveCommonCheckpoint([{ userId: 'a', checkpoints: [0.1], isActive: false }]).commonMaxIndex, -1);
});

test('resolveCommonCheckpoint: an active runner with NO checkpoint yet → fallback signal', () => {
  // One side has checkpoints, the other is active but empty → there is no common index.
  const result = resolveCommonCheckpoint([
    { userId: 'a', checkpoints: [0.1, 0.2, 0.3], isActive: true },
    { userId: 'b', checkpoints: [], isActive: true },
  ]);
  assert.equal(result.commonMaxIndex, -1, 'no fake 0.00 compare when one active side has no checkpoint');
});
