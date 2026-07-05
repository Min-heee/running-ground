// Pure ETA + scheduling-decision logic for the "finish approaching — turn your screen on"
// local reminder. No expo-notifications import, no side effects, fully unit-testable.
//
// WHY a TIME-based schedule (not a distance threshold): on iOS a locked screen suspends the
// JS thread, so the run's DISTANCE freezes (GPS still arrives but is never processed). A
// "remaining < buffer" distance trigger would therefore NEVER fire screen-off, exactly when
// it matters. Instead we compute, while JS is alive, an ETA in seconds to the point ~300m
// before the finish and ask the OS to fire a DATE-scheduled notification then — the OS
// delivers scheduled notifications even while JS is suspended.

// Fire the reminder this far BEFORE the target distance (~1 min of lead at a typical 5:30/km).
export const FINISH_REMINDER_BUFFER_KM = 0.3;

// Only (re)schedule when the new fire-time moved by more than this, so we don't thrash the OS
// scheduler on every GPS snapshot (the freshest distance jitters slightly each tick).
export const FINISH_REMINDER_RESCHEDULE_THRESHOLD_SECONDS = 10;

// Clamp the run's average pace so a garbage pace (e.g. distance barely accrued early on, or a
// background-stale denominator) can't schedule an absurd fire-time. 2:30/km is faster than the
// marathon world record; 15:00/km is a slow walk — anything outside is a tracking artifact.
export const MIN_REMINDER_PACE_SECONDS_PER_KM = 150; // 2:30/km
export const MAX_REMINDER_PACE_SECONDS_PER_KM = 900; // 15:00/km

export type FinishApproachReminderInputs = {
  // Whether the run is active (isRunning && has a finish line). When false → 'cancel'.
  active: boolean;
  // The run's goal/target distance in km (duel/group target, or a solo goal). A no-goal solo
  // run passes null/undefined → no reminder ('cancel').
  targetDistanceKm?: number | null;
  // Freshest cumulative distance in km.
  currentDistanceKm: number;
  // The run's AVERAGE pace in seconds/km (elapsed / distance). null/undefined when not yet
  // measurable (distance ~0 at start) → 'wait'.
  averagePaceSecondsPerKm?: number | null;
  // Whether the runner has already crossed the finish / forfeited / the match has ended. When
  // true we never (re)schedule → 'cancel' (the run-end path also fires this).
  isFinished?: boolean;
  // Whether the one-shot reminder has already fired for this run. Fire at most once.
  hasFired: boolean;
  // The fire-delay (seconds-from-now) of the currently-scheduled reminder, or null when none is
  // pending. Used to throttle reschedules.
  scheduledInSeconds?: number | null;
  // How far BEFORE the target distance the reminder should fire, in km. Defaults to the ~300m
  // approach buffer (the only production caller; kept generic for tests / future reminders).
  bufferKm?: number;
};

export type FinishApproachReminderDecision =
  // (Re)schedule a one-shot reminder this many seconds from now.
  | { action: 'schedule'; etaSeconds: number }
  // Already within the buffer — present immediately and mark fired.
  | { action: 'present-now' }
  // Cancel any pending reminder (run ended / finished / no goal).
  | { action: 'cancel' }
  // Keep whatever is pending; nothing to do (pace not ready, already fired, throttled).
  | { action: 'none' };

function clampPace(seconds: number): number {
  if (seconds < MIN_REMINDER_PACE_SECONDS_PER_KM) {
    return MIN_REMINDER_PACE_SECONDS_PER_KM;
  }
  if (seconds > MAX_REMINDER_PACE_SECONDS_PER_KM) {
    return MAX_REMINDER_PACE_SECONDS_PER_KM;
  }
  return seconds;
}

// Seconds from now until the runner is expected to reach (target − buffer), using the freshest
// distance and the run's (clamped) average pace. Returns null when there is no real goal or no
// usable pace yet. Clamped to >= 0. `bufferKm` defaults to the ~300m approach buffer.
export function computeFinishReminderEtaSeconds(params: {
  targetDistanceKm?: number | null;
  currentDistanceKm: number;
  averagePaceSecondsPerKm?: number | null;
  bufferKm?: number;
}): number | null {
  const {
    targetDistanceKm,
    currentDistanceKm,
    averagePaceSecondsPerKm,
    bufferKm = FINISH_REMINDER_BUFFER_KM,
  } = params;

  if (
    typeof targetDistanceKm !== 'number'
    || !Number.isFinite(targetDistanceKm)
    || targetDistanceKm <= 0
  ) {
    return null;
  }

  if (
    typeof averagePaceSecondsPerKm !== 'number'
    || !Number.isFinite(averagePaceSecondsPerKm)
    || averagePaceSecondsPerKm <= 0
  ) {
    return null;
  }

  const triggerDistanceKm = targetDistanceKm - bufferKm;
  const remainingKm = Math.max(0, triggerDistanceKm - currentDistanceKm);
  return remainingKm * clampPace(averagePaceSecondsPerKm);
}

// The single decision the hook acts on each tracking snapshot / status update. Pure: same
// inputs → same output, no clocks, no I/O.
export function decideFinishApproachReminder(
  inputs: FinishApproachReminderInputs,
): FinishApproachReminderDecision {
  // Run ended / no finish line / already finished → tear down any pending reminder.
  if (
    !inputs.active
    || inputs.isFinished === true
    || typeof inputs.targetDistanceKm !== 'number'
    || !Number.isFinite(inputs.targetDistanceKm)
    || inputs.targetDistanceKm <= 0
  ) {
    return { action: 'cancel' };
  }

  // Fire at most once per run.
  if (inputs.hasFired) {
    return { action: 'none' };
  }

  const etaSeconds = computeFinishReminderEtaSeconds({
    targetDistanceKm: inputs.targetDistanceKm,
    currentDistanceKm: inputs.currentDistanceKm,
    averagePaceSecondsPerKm: inputs.averagePaceSecondsPerKm,
    bufferKm: inputs.bufferKm,
  });

  // No usable pace yet (distance ~0 at start) → wait; don't schedule a bogus time.
  if (etaSeconds === null) {
    return { action: 'none' };
  }

  // Already within the buffer → present immediately (the scheduler also marks fired).
  if (etaSeconds <= 0) {
    return { action: 'present-now' };
  }

  // Throttle reschedules: only re-arm when the fire-time moved by more than the threshold, so a
  // jittery freshest-distance doesn't thrash the OS scheduler every snapshot.
  const pending = inputs.scheduledInSeconds;
  if (
    typeof pending === 'number'
    && Number.isFinite(pending)
    && Math.abs(pending - etaSeconds) <= FINISH_REMINDER_RESCHEDULE_THRESHOLD_SECONDS
  ) {
    return { action: 'none' };
  }

  return { action: 'schedule', etaSeconds };
}
