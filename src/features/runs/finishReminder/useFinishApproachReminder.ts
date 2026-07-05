import { useEffect, useRef } from 'react';

import { subscribeBackgroundRunTracking } from '@/features/runs/tracking/background';
import {
  decideFinishApproachReminder,
  type FinishApproachReminderInputs,
} from '@/features/runs/finishReminder/finishApproachReminderDecision';
import {
  cancelFinishApproachReminder,
  presentFinishApproachReminderNow,
  scheduleFinishApproachReminder,
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

// Schedules ONE time-based "turn your screen on" local notification per run with a finish line:
// the APPROACH reminder ~1 min (300m) before the runner reaches the target distance, so the
// distance + finish are captured accurately even from a screen-off run. (The former second
// goal-ETA alarm at the projected crossing itself is REMOVED — the hands-free finish pipeline
// freezes/delivers the crossing without waking the runner; see docs/handsfree-finish-design.)
// Fires ONCE per run; reschedules (throttled) as its ETA drifts; cancels on run end / finish /
// forfeit / unmount. Permission is assumed already granted at onboarding; the notification
// module no-ops when it isn't.
export function useFinishApproachReminder(input: FinishApproachReminderInput) {
  // Latest input read through a ref so neither the timer nor the GPS-snapshot closure goes stale.
  const inputRef = useRef(input);
  inputRef.current = input;

  // Per-run guard rails (reset on each new active run):
  // - hasFiredRef: fire-once flag.
  // - scheduledInSecondsRef: the fire-delay of the currently-pending reminder, for throttling.
  // - runActiveRef: tracks whether we are inside an active-run episode, so we reset the
  //   fire-once flag exactly when a NEW run starts (active false → true edge).
  const hasFiredRef = useRef(false);
  const scheduledInSecondsRef = useRef<number | null>(null);
  const runActiveRef = useRef(false);

  const active = input.active
    && typeof input.targetDistanceKm === 'number'
    && Number.isFinite(input.targetDistanceKm)
    && input.targetDistanceKm > 0;

  useEffect(() => {
    if (!active) {
      // Run not active / no finish line: tear down any pending reminder and arm the next run.
      runActiveRef.current = false;
      hasFiredRef.current = false;
      scheduledInSecondsRef.current = null;
      void cancelFinishApproachReminder();
      return undefined;
    }

    // New active-run episode → reset the fire-once flag.
    if (!runActiveRef.current) {
      runActiveRef.current = true;
      hasFiredRef.current = false;
      scheduledInSecondsRef.current = null;
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
          void cancelFinishApproachReminder();
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
