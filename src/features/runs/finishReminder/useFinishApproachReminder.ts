import { useEffect, useRef } from 'react';

import { subscribeBackgroundRunTracking } from '@/features/runs/tracking/background';
import {
  decideFinishApproachReminder,
  GOAL_ETA_REMINDER_BUFFER_KM,
  type FinishApproachReminderInputs,
} from '@/features/runs/finishReminder/finishApproachReminderDecision';
import {
  cancelFinishApproachReminder,
  presentFinishApproachReminderNow,
  presentGoalEtaReminderNow,
  scheduleFinishApproachReminder,
  scheduleGoalEtaReminder,
} from '@/features/runs/finishReminder/finishApproachNotification';

// How often the time-driven re-evaluation runs while the screen is on. The GPS-snapshot
// subscription is the screen-off-reliable driver (Android keeps emitting snapshots from the
// native location task even with the JS timer suspended); the 1s timer covers screen-on + the
// iOS background CPU windows. Both call the same evaluator sharing one set of refs.
const REEVALUATE_TICK_MS = 1000;

export type FinishApproachReminderInput = {
  // Whether the run is active (isRunning) AND has a finish line. Solo with no goal passes
  // active: false (or targetDistanceKm null) so no reminder is scheduled.
  active: boolean;
  // The run's goal/target distance in km (duel/group target or a solo goal). null/undefined →
  // no finish line → no reminder.
  targetDistanceKm?: number | null;
  // Freshest cumulative distance in km.
  currentDistanceKm: number;
  // The run's AVERAGE pace in seconds/km (elapsed / distance), or null when not yet measurable.
  averagePaceSecondsPerKm?: number | null;
  // Whether the runner has already finished / forfeited / the match ended.
  isFinished?: boolean;
};

// Schedules TWO time-based "turn your screen on" local notifications per run with a finish line:
//   1) the APPROACH reminder ~1 min (300m) before the runner reaches the target distance, and
//   2) (§3.⑤, fair-verdict design) the GOAL-ETA reminder at the projected moment of CROSSING it —
//      the second nudge that wakes a still-screen-off runner exactly when the finish upload needs
//      the screen, shrinking the only unbounded finish-delivery lag term (screen-off duration).
// Each fires ONCE per run; each reschedules (throttled) as its ETA drifts; both cancel on run
// end / finish / forfeit / unmount. Permission is assumed already granted at onboarding; the
// notification module no-ops when it isn't.
export function useFinishApproachReminder(input: FinishApproachReminderInput) {
  // Latest input read through a ref so neither the timer nor the GPS-snapshot closure goes stale.
  const inputRef = useRef(input);
  inputRef.current = input;

  // Per-run guard rails (reset on each new active run):
  // - hasFiredRef / goalHasFiredRef: fire-once flags, independent per reminder.
  // - scheduledInSecondsRef / goalScheduledInSecondsRef: the fire-delay of each currently-pending
  //   reminder, for throttling.
  // - runActiveRef: tracks whether we are inside an active-run episode, so we reset the
  //   fire-once flags exactly when a NEW run starts (active false → true edge).
  const hasFiredRef = useRef(false);
  const scheduledInSecondsRef = useRef<number | null>(null);
  const goalHasFiredRef = useRef(false);
  const goalScheduledInSecondsRef = useRef<number | null>(null);
  const runActiveRef = useRef(false);

  const active = input.active
    && typeof input.targetDistanceKm === 'number'
    && Number.isFinite(input.targetDistanceKm)
    && input.targetDistanceKm > 0;

  useEffect(() => {
    if (!active) {
      // Run not active / no finish line: tear down any pending reminders and arm the next run.
      runActiveRef.current = false;
      hasFiredRef.current = false;
      scheduledInSecondsRef.current = null;
      goalHasFiredRef.current = false;
      goalScheduledInSecondsRef.current = null;
      void cancelFinishApproachReminder();
      return undefined;
    }

    // New active-run episode → reset the fire-once flags.
    if (!runActiveRef.current) {
      runActiveRef.current = true;
      hasFiredRef.current = false;
      scheduledInSecondsRef.current = null;
      goalHasFiredRef.current = false;
      goalScheduledInSecondsRef.current = null;
    }

    const evaluate = () => {
      const current = inputRef.current;
      const decisionInputs: FinishApproachReminderInputs = {
        active: current.active,
        targetDistanceKm: current.targetDistanceKm,
        currentDistanceKm: current.currentDistanceKm,
        averagePaceSecondsPerKm: current.averagePaceSecondsPerKm,
        isFinished: current.isFinished,
        hasFired: hasFiredRef.current,
        scheduledInSeconds: scheduledInSecondsRef.current,
      };

      const decision = decideFinishApproachReminder(decisionInputs);

      switch (decision.action) {
        case 'schedule':
          scheduledInSecondsRef.current = decision.etaSeconds;
          void scheduleFinishApproachReminder(decision.etaSeconds);
          break;
        case 'present-now':
          hasFiredRef.current = true;
          scheduledInSecondsRef.current = null;
          void presentFinishApproachReminderNow();
          break;
        case 'cancel':
          scheduledInSecondsRef.current = null;
          goalScheduledInSecondsRef.current = null;
          // Tears down BOTH reminders (the cancel condition — run ended / finished / no goal —
          // is identical for the two decisions, so the goal pass below will also be 'cancel').
          void cancelFinishApproachReminder();
          break;
        case 'none':
        default:
          break;
      }

      // §3.⑤ — the GOAL-ETA reminder: the SAME pure decision run with a 0km buffer and its own
      // fire-once/throttle state, mirroring the approach reminder's scheduling idiom exactly.
      const goalDecision = decideFinishApproachReminder({
        ...decisionInputs,
        bufferKm: GOAL_ETA_REMINDER_BUFFER_KM,
        hasFired: goalHasFiredRef.current,
        scheduledInSeconds: goalScheduledInSecondsRef.current,
      });

      switch (goalDecision.action) {
        case 'schedule':
          goalScheduledInSecondsRef.current = goalDecision.etaSeconds;
          void scheduleGoalEtaReminder(goalDecision.etaSeconds);
          break;
        case 'present-now':
          goalHasFiredRef.current = true;
          goalScheduledInSecondsRef.current = null;
          void presentGoalEtaReminderNow();
          break;
        case 'cancel':
          // Already handled by the approach pass above (cancelFinishApproachReminder cancels
          // both kinds); just drop the local schedule bookkeeping.
          goalScheduledInSecondsRef.current = null;
          break;
        case 'none':
        default:
          break;
      }
    };

    // Evaluate immediately so an already-within-buffer run (rejoined late) fires at once.
    evaluate();

    const intervalId = setInterval(evaluate, REEVALUATE_TICK_MS);
    // GPS-emission cadence — the screen-off-reliable driver on Android.
    const unsubscribeTracking = subscribeBackgroundRunTracking(() => {
      evaluate();
    }, { cloneRoute: false });

    return () => {
      clearInterval(intervalId);
      unsubscribeTracking();
      // Run ended / unmounted → drop any pending reminder so it never fires after the finish.
      scheduledInSecondsRef.current = null;
      void cancelFinishApproachReminder();
    };
  }, [active]);
}
