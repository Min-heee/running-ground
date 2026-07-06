// Anti-cheat V1: pure decision logic for the competitive motion-permission gate.
//
// Cadence (the step counter) is the cycling-detection signal, and its false-positive hole is an
// honest runner who denied the motion/activity permission. So COMPETITIVE modes — 매칭찾기 (duel +
// group matchmaking) and 파티런 (room create / invite accept / room join) — now require the motion
// permission up front. Solo runs stay ungated.
//
// This module is intentionally React-Native-free so it runs under the node test runner; the async
// wiring to the real Pedometer APIs lives in ensureCompetitivePreflight.ts (motion is step 2 of
// the competitive pre-flight, after the blocking location gate).

export type CompetitiveMotionGateReason =
  | 'denied-can-ask'
  | 'denied-settings'
  | 'unavailable';

export type CompetitiveMotionGateResult =
  | { ok: true }
  | { ok: false; reason: CompetitiveMotionGateReason };

// Mirrors readMotionGate() in onboardingPermissions.ts: `available` is Pedometer.isAvailableAsync()
// (false also covers Expo Go / a thrown permission read), and `granted`/`canAsk` come from
// Pedometer.getPermissionsAsync().
export type CompetitiveMotionGateReading = {
  available: boolean;
  canAsk: boolean;
  granted: boolean;
};

export type CompetitiveMotionGateDecisionInput = CompetitiveMotionGateReading & {
  // canAsk from a FRESH readMotionGate() taken AFTER a failed request. After a dismissed/denied
  // dialog the OS may still allow another prompt (Android allows a re-ask; iOS locks after the
  // first deny), and only a fresh read can tell. undefined = no fresh read available.
  canAskAfterRequest?: boolean;
  // Result of the single requestMotion() attempt. undefined = no request was fired.
  requestGranted?: boolean;
};

// The helper fires the OS dialog at most once per gate pass, and only when it could succeed:
// not already granted, sensor present, and the OS hasn't locked further prompts.
export function shouldRequestCompetitiveMotionPermission(
  reading: CompetitiveMotionGateReading,
): boolean {
  return !reading.granted && reading.available && reading.canAsk;
}

export function resolveCompetitiveMotionGate(
  input: CompetitiveMotionGateDecisionInput,
): CompetitiveMotionGateResult {
  if (input.granted || input.requestGranted === true) {
    return { ok: true };
  }

  if (!input.available) {
    // No step sensor at all (or Expo Go / permission APIs threw): the permission can never be
    // granted on this device, so the caller shows the "device unsupported" copy.
    return { ok: false, reason: 'unavailable' };
  }

  if (!input.canAsk) {
    // The OS has locked further prompts (hard denial) — only the Settings app can fix it.
    return { ok: false, reason: 'denied-settings' };
  }

  if (input.requestGranted === undefined) {
    // Still promptable but no request was attempted in this pass — the next attempt can still
    // surface the OS dialog.
    return { ok: false, reason: 'denied-can-ask' };
  }

  // canAsk was true and the single request did not grant. Classify off the fresh post-request
  // read when we have one: still-askable means the user dismissed the dialog (next press can
  // re-prompt); otherwise — including no fresh read — default to the Settings route, the safe
  // choice when re-askability cannot be confirmed.
  if (input.canAskAfterRequest === true) {
    return { ok: false, reason: 'denied-can-ask' };
  }

  return { ok: false, reason: 'denied-settings' };
}
