import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  computeFinishReminderEtaSeconds,
  decideFinishApproachReminder,
  FINISH_REMINDER_BUFFER_KM,
  FINISH_REMINDER_RESCHEDULE_THRESHOLD_SECONDS,
  MAX_REMINDER_PACE_SECONDS_PER_KM,
  MIN_REMINDER_PACE_SECONDS_PER_KM,
  type FinishApproachReminderInputs,
} from './finishApproachReminderDecision';

function baseInputs(partial: Partial<FinishApproachReminderInputs> = {}): FinishApproachReminderInputs {
  return {
    active: true,
    targetDistanceKm: 5,
    currentDistanceKm: 2,
    averagePaceSecondsPerKm: 330, // 5:30/km
    isFinished: false,
    hasFired: false,
    scheduledInSeconds: null,
    ...partial,
  };
}

// --- computeFinishReminderEtaSeconds ---

test('etaSeconds = remaining-to-(target-buffer) * pace', () => {
  // target 5km, buffer 0.3 → trigger at 4.7km; at 2km, 2.7km remain; 2.7 * 330 = 891s.
  const eta = computeFinishReminderEtaSeconds({
    targetDistanceKm: 5,
    currentDistanceKm: 2,
    averagePaceSecondsPerKm: 330,
  });
  assert.equal(eta, 2.7 * 330);
  assert.equal(FINISH_REMINDER_BUFFER_KM, 0.3);
});

test('etaSeconds clamps to 0 once within the buffer (no negative time)', () => {
  // At 4.9km with a 4.7km trigger, the trigger is already passed → 0.
  const eta = computeFinishReminderEtaSeconds({
    targetDistanceKm: 5,
    currentDistanceKm: 4.9,
    averagePaceSecondsPerKm: 330,
  });
  assert.equal(eta, 0);
});

test('etaSeconds is null with no goal (no finish line)', () => {
  assert.equal(
    computeFinishReminderEtaSeconds({ targetDistanceKm: null, currentDistanceKm: 1, averagePaceSecondsPerKm: 330 }),
    null,
  );
  assert.equal(
    computeFinishReminderEtaSeconds({ targetDistanceKm: 0, currentDistanceKm: 1, averagePaceSecondsPerKm: 330 }),
    null,
  );
});

test('etaSeconds is null when pace is not ready (distance ~0 at start)', () => {
  assert.equal(
    computeFinishReminderEtaSeconds({ targetDistanceKm: 5, currentDistanceKm: 0, averagePaceSecondsPerKm: null }),
    null,
  );
  assert.equal(
    computeFinishReminderEtaSeconds({ targetDistanceKm: 5, currentDistanceKm: 0, averagePaceSecondsPerKm: 0 }),
    null,
  );
});

test('etaSeconds clamps an absurdly slow garbage pace to the max sane pace', () => {
  // 2.7km remaining at a garbage 6000s/km would schedule ~4.5h out; clamp to 900s/km.
  const eta = computeFinishReminderEtaSeconds({
    targetDistanceKm: 5,
    currentDistanceKm: 2,
    averagePaceSecondsPerKm: 6000,
  });
  assert.equal(eta, 2.7 * MAX_REMINDER_PACE_SECONDS_PER_KM);
});

test('etaSeconds clamps an absurdly fast garbage pace to the min sane pace', () => {
  const eta = computeFinishReminderEtaSeconds({
    targetDistanceKm: 5,
    currentDistanceKm: 2,
    averagePaceSecondsPerKm: 10,
  });
  assert.equal(eta, 2.7 * MIN_REMINDER_PACE_SECONDS_PER_KM);
});

// --- decideFinishApproachReminder ---

test('schedules a one-shot reminder when active, has goal, pace ready, not fired', () => {
  const decision = decideFinishApproachReminder(baseInputs());
  assert.deepEqual(decision, { action: 'schedule', etaSeconds: 2.7 * 330 });
});

test('cancels when no goal (solo with no finish line)', () => {
  assert.deepEqual(decideFinishApproachReminder(baseInputs({ targetDistanceKm: null })), { action: 'cancel' });
  assert.deepEqual(decideFinishApproachReminder(baseInputs({ targetDistanceKm: 0 })), { action: 'cancel' });
});

test('cancels on run end (isRunning -> false)', () => {
  assert.deepEqual(decideFinishApproachReminder(baseInputs({ active: false })), { action: 'cancel' });
});

test('cancels when already finished / forfeited', () => {
  assert.deepEqual(decideFinishApproachReminder(baseInputs({ isFinished: true })), { action: 'cancel' });
});

test('does not schedule when pace is not ready yet (waits)', () => {
  assert.deepEqual(
    decideFinishApproachReminder(baseInputs({ currentDistanceKm: 0, averagePaceSecondsPerKm: null })),
    { action: 'none' },
  );
});

test('fires once — never reschedules after it has fired', () => {
  assert.deepEqual(decideFinishApproachReminder(baseInputs({ hasFired: true })), { action: 'none' });
});

test('presents immediately when already within the buffer and not yet fired', () => {
  assert.deepEqual(
    decideFinishApproachReminder(baseInputs({ currentDistanceKm: 4.95 })),
    { action: 'present-now' },
  );
});

test('throttle: keeps the pending schedule when the new ETA barely moved', () => {
  const eta = 2.7 * 330;
  const decision = decideFinishApproachReminder(
    baseInputs({ scheduledInSeconds: eta - FINISH_REMINDER_RESCHEDULE_THRESHOLD_SECONDS + 1 }),
  );
  assert.deepEqual(decision, { action: 'none' });
});

test('throttle: reschedules when the new ETA moved past the threshold', () => {
  const eta = 2.7 * 330;
  const decision = decideFinishApproachReminder(
    baseInputs({ scheduledInSeconds: eta - FINISH_REMINDER_RESCHEDULE_THRESHOLD_SECONDS - 1 }),
  );
  assert.deepEqual(decision, { action: 'schedule', etaSeconds: eta });
});

test('no pending schedule -> always schedules (first arm)', () => {
  assert.deepEqual(
    decideFinishApproachReminder(baseInputs({ scheduledInSeconds: null })),
    { action: 'schedule', etaSeconds: 2.7 * 330 },
  );
});
