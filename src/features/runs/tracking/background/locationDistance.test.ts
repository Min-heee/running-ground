import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCURACY_SCALE_CAP_METERS,
  capAccuracyForThresholdScaling,
  DISTANCE_GATE_ACCURACY_SCALE,
  DISTANCE_GATE_BASE_METERS,
  MAX_TRACKING_ACCURACY_METERS,
  MIN_MOVEMENT_DISTANCE_METERS,
  resolveDistanceGateMeters,
  resolveDynamicMinMovementMeters,
  shouldIgnoreNoisySegment,
} from '@/features/runs/tracking/background/locationDistance';

// CROSS-DEVICE PARITY CAP — pins for the accuracy-scale cap. Vendor accuracy ESTIMATES differ
// (Galaxy single-band reports 10-20m where iPhone multi-band reports 3-8m for comparable fixes);
// these tests pin that an inflated estimate can no longer widen the accuracy-SCALED thresholds
// beyond what a 15m fix would produce, while the hard-reject and classification comparisons keep
// using the raw value.

test('accuracy-scale cap is pinned at 15m and clamps only the scaled value', () => {
  assert.equal(ACCURACY_SCALE_CAP_METERS, 15);
  assert.equal(capAccuracyForThresholdScaling(20), 15);
  assert.equal(capAccuracyForThresholdScaling(15), 15);
  assert.equal(capAccuracyForThresholdScaling(12), 12);
  assert.equal(capAccuracyForThresholdScaling(-3), 0);
});

test('distance gate: accuracy 20 uses the 15m cap; accuracy 12 is unchanged', () => {
  // Capped: an accuracy-20 fix gets EXACTLY the accuracy-15 gate — 3.0 + 15 * 0.15 = 5.25m.
  assert.equal(resolveDistanceGateMeters(20), resolveDistanceGateMeters(ACCURACY_SCALE_CAP_METERS));
  assert.equal(
    resolveDistanceGateMeters(20),
    DISTANCE_GATE_BASE_METERS + ACCURACY_SCALE_CAP_METERS * DISTANCE_GATE_ACCURACY_SCALE,
  );
  assert.equal(resolveDistanceGateMeters(20), 5.25);

  // Below the cap: unchanged accuracy-proportional gate — 3.0 + 12 * 0.15 = 4.8m.
  assert.equal(resolveDistanceGateMeters(12), 4.8);

  // Even a worst-still-tracked accuracy (40m — the hard-reject threshold itself) cannot widen the
  // gate past the capped 5.25m.
  assert.equal(resolveDistanceGateMeters(MAX_TRACKING_ACCURACY_METERS), 5.25);
});

test('dynamic min-movement: capped accuracy can no longer raise the floor above the base', () => {
  // Uncapped, accuracy 45 produced min(4.5, 4.5) = 4.5m; capped, 15 * 0.1 = 1.5m never beats the
  // 3.0m base floor, so the min-movement gate is identical on both devices.
  assert.equal(resolveDynamicMinMovementMeters(45), MIN_MOVEMENT_DISTANCE_METERS);
  assert.equal(resolveDynamicMinMovementMeters(12), MIN_MOVEMENT_DISTANCE_METERS);
});

test('stationary noise radius: EXEMPT from the accuracy cap (full raw-accuracy suppression)', () => {
  // A stationary-classified segment (speed < STATIONARY_SPEED_MPS) can never be real running,
  // so its suppression radius keeps the RAW accuracy scaling: at worst accuracy 40 the radius
  // is max(4, min(12, 40 * 0.35)) = 12m. With Android now on the full 1Hz drift stream (no 4m
  // OS pre-gate), red-light multipath wander needs this full radius or standing still slowly
  // accrues phantom meters on the noisier device.
  assert.equal(
    shouldIgnoreNoisySegment({
      segmentDistanceMeters: 6,
      segmentSpeedMps: 0.8,
      worstAccuracyM: 40,
      reliableSpeedMps: 0.8,
    }),
    true,
  );

  // Beyond the raw radius (12m at acc 40) genuine slow movement still counts.
  assert.equal(
    shouldIgnoreNoisySegment({
      segmentDistanceMeters: 13,
      segmentSpeedMps: 0.8,
      worstAccuracyM: 40,
      reliableSpeedMps: 0.8,
    }),
    false,
  );

  // Moving at real running speed the stationary branch never fires regardless of radius.
  assert.equal(
    shouldIgnoreNoisySegment({
      segmentDistanceMeters: 6,
      segmentSpeedMps: 3.2,
      worstAccuracyM: 40,
      reliableSpeedMps: 3.2,
    }),
    false,
  );
});

test('poor-accuracy branch: classification stays RAW, only the radius is capped', () => {
  // worstAccuracyM 40 >= POOR_ACCURACY_METERS (raw comparison) still classifies as poor, but the
  // drop radius is min(12, 15 * 0.25) = 3.75m — not the uncapped 10m.
  assert.equal(
    shouldIgnoreNoisySegment({
      segmentDistanceMeters: 3.5,
      segmentSpeedMps: 1.2,
      worstAccuracyM: 40,
      reliableSpeedMps: null,
    }),
    true,
  );
  assert.equal(
    shouldIgnoreNoisySegment({
      segmentDistanceMeters: 4,
      segmentSpeedMps: 1.2,
      worstAccuracyM: 40,
      reliableSpeedMps: null,
    }),
    false,
  );
});

test('hard-reject accuracy threshold stays uncapped and unchanged at 40m', () => {
  // The cap applies ONLY to scaled thresholds; the accuracyM > 40 fix rejection (routeAccumulator)
  // keeps comparing the raw value against the unchanged constant.
  assert.equal(MAX_TRACKING_ACCURACY_METERS, 40);
  assert.ok(ACCURACY_SCALE_CAP_METERS < MAX_TRACKING_ACCURACY_METERS);
});
