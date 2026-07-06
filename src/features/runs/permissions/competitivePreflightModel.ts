// Competitive pre-flight: pure decision logic for the LOCATION gate, the soft (never-blocking)
// notification / battery-exemption steps, and the combinator that folds the per-step results into
// one entry decision.
//
// A competitive match measures with GPS while the screen is off, so entry requires foreground
// location AND background "항상 허용" up front (previously only requested at slot start — audit
// P1-9: a stranger's first match started unmeasured). Motion keeps its own model in
// competitiveMotionGateModel.ts; this module consumes its result type only.
//
// Intentionally React-Native-free so it runs under the node test runner; the async wiring to the
// real permission APIs (and every Alert) lives in ensureCompetitivePreflight.ts.

import type {
  CompetitiveMotionGateReason,
  CompetitiveMotionGateResult,
} from './competitiveMotionGateModel';

// --- location gate (BLOCKING) -----------------------------------------------------------------

export type CompetitiveLocationGateReason =
  // Foreground location missing and the single OS dialog didn't grant it.
  | 'foreground-denied'
  // The user cancelled OUR background-location disclosure alert — block silently (they just
  // answered an alert; a second one would be a nag). Next press re-offers the disclosure.
  | 'background-declined'
  // The user accepted the disclosure but the OS has locked background prompts (canAsk false), so
  // a request would silently no-op — the wiring honors the button by opening Settings directly.
  | 'background-request-locked'
  // A background request was attempted (dialog or OS settings route) and the fresh re-read still
  // isn't "always" — the wiring shows the settings alert variant.
  | 'background-denied';

export type CompetitiveLocationGateResult =
  | { ok: true }
  | { ok: false; reason: CompetitiveLocationGateReason };

// Mirrors readLocationGate() in onboardingPermissions.ts: granted flags come from expo's
// foreground/background permission reads (background granted === the "always"-equivalent check),
// and backgroundCanAsk is canAskAgain on the background permission.
export type CompetitiveLocationGateReading = {
  backgroundCanAsk: boolean;
  backgroundGranted: boolean;
  foregroundGranted: boolean;
};

export type CompetitiveLocationGateDecisionInput = CompetitiveLocationGateReading & {
  // Fresh backgroundGranted re-read AFTER a background request attempt. iOS may under-report the
  // request result (provisional / settings-route grants), so only a re-read — where anything
  // short of "always" reads as not-granted — decides. undefined = no attempt was made.
  backgroundAfterRequest?: boolean;
  // The prominent-disclosure alert outcome (Play policy: disclosure BEFORE any background
  // request). true = 허용하러 가기, false = 취소/dismiss, undefined = never shown (background was
  // already granted, or foreground blocked first).
  disclosureAccepted?: boolean;
  // Result of the single requestBackgroundLocation() attempt. undefined = not fired.
  requestedBackground?: boolean;
  // Result of the single requestForegroundLocation() OS dialog. undefined = not fired (already
  // granted).
  requestedForeground?: boolean;
};

export function resolveCompetitiveLocationGate(
  input: CompetitiveLocationGateDecisionInput,
): CompetitiveLocationGateResult {
  const foregroundOk = input.foregroundGranted || input.requestedForeground === true;
  if (!foregroundOk) {
    // Background can't even be requested without foreground — this is the terminal reason.
    return { ok: false, reason: 'foreground-denied' };
  }

  if (
    input.backgroundGranted ||
    input.requestedBackground === true ||
    input.backgroundAfterRequest === true
  ) {
    return { ok: true };
  }

  if (input.disclosureAccepted === false) {
    return { ok: false, reason: 'background-declined' };
  }

  if (!input.backgroundCanAsk) {
    return { ok: false, reason: 'background-request-locked' };
  }

  // Askable, disclosure not declined, attempt (if any) failed — the settings route is the safe
  // default, matching the motion gate's failed-request policy.
  return { ok: false, reason: 'background-denied' };
}

// --- soft steps (never block) ------------------------------------------------------------------

// Notifications: one request per app session when still askable. Denial is fine — the match works
// without them, celebration/alert pushes just won't show — so there is no blocking result and no
// settings-nag for this step.
export function shouldRequestCompetitiveNotifications(input: {
  canAsk: boolean;
  granted: boolean;
  requestedThisSession: boolean;
}): boolean {
  return !input.granted && input.canAsk && !input.requestedThisSession;
}

// Android battery-optimization exemption: one request per app session when the native control is
// available and the app isn't already exempt. Never blocks (available is false on iOS and on old
// Android binaries).
export function shouldRequestCompetitiveBatteryExemption(input: {
  available: boolean;
  exempt: boolean;
  requestedThisSession: boolean;
}): boolean {
  return input.available && !input.exempt && !input.requestedThisSession;
}

// --- overall combinator --------------------------------------------------------------------------

export type CompetitivePreflightBlock =
  | { kind: 'location'; reason: CompetitiveLocationGateReason }
  | { kind: 'motion'; reason: CompetitiveMotionGateReason };

export type CompetitivePreflightResult =
  | { ok: true }
  | { ok: false; block: CompetitivePreflightBlock };

// Folds the sequenced step results into the single entry decision. Location and motion are the
// only blocking gates; notifications/battery state is accepted here precisely to pin the policy
// that soft outcomes can NEVER block a competitive entry.
export function combineCompetitivePreflight(input: {
  batteryExempt: boolean;
  location: CompetitiveLocationGateResult;
  // null = motion was skipped because the location gate already blocked (the wiring never runs
  // later steps after a block).
  motion: CompetitiveMotionGateResult | null;
  notificationsGranted: boolean;
}): CompetitivePreflightResult {
  if (!input.location.ok) {
    return { block: { kind: 'location', reason: input.location.reason }, ok: false };
  }

  if (input.motion && !input.motion.ok) {
    return { block: { kind: 'motion', reason: input.motion.reason }, ok: false };
  }

  // notificationsGranted / batteryExempt intentionally unread beyond this point: soft steps are
  // best-effort and never blocking.
  return { ok: true };
}
