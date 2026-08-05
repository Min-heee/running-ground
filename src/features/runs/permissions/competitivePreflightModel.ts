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
  // The user declined OUR in-app prominent-disclosure consent before any OS dialog — block
  // silently (they just answered an alert). Next press re-offers the disclosure.
  | 'foreground-consent-declined'
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
  // true = the user declined the in-app prominent-disclosure consent (no OS dialog ever fired).
  foregroundConsentDeclined?: boolean;
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
    if (input.foregroundConsentDeclined === true) {
      // OS 팝업은 뜬 적도 없다 — 방금 우리 공개 알림에 답한 사용자에게 설정 알림을
      // 겹쳐 보내지 않는다.
      return { ok: false, reason: 'foreground-consent-declined' };
    }
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

// --- battery gate (BLOCKING on Android) ----------------------------------------------------------

// Android battery optimization can suspend screen-off measurement (#191: the OS killed the FG
// service task while optimization was active) — a match where one phone's distance can freeze is
// not a fair match, so on Android the exemption is REQUIRED for competitive entry. iOS and old
// Android binaries report the control unavailable → pass (nothing to check, nothing to demand).
//
// The OS exemption dialog is fire-and-forget (no awaitable answer), so the gate blocks in two
// stages: the first press FIRES the dialog and blocks silently (an alert would stack over the OS
// sheet); if the user granted, the next press reads exempt and passes — otherwise the next press
// shows the settings alert.
export type CompetitiveBatteryGateReason =
  // First not-exempt press this session: the wiring fires the OS dialog and blocks WITHOUT an
  // alert. A grant makes the next press pass; nothing else to show yet.
  | 'battery-request-fired'
  // Still not exempt after a request already fired this session — settings alert.
  | 'battery-denied';

export type CompetitiveBatteryGateResult =
  | { ok: true }
  | { ok: false; reason: CompetitiveBatteryGateReason };

export function resolveCompetitiveBatteryGate(input: {
  available: boolean;
  exempt: boolean;
  requestedThisSession: boolean;
}): CompetitiveBatteryGateResult {
  if (!input.available || input.exempt) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: input.requestedThisSession ? 'battery-denied' : 'battery-request-fired',
  };
}

// --- overall combinator --------------------------------------------------------------------------

export type CompetitivePreflightBlock =
  | { kind: 'battery'; reason: CompetitiveBatteryGateReason }
  | { kind: 'location'; reason: CompetitiveLocationGateReason }
  | { kind: 'motion'; reason: CompetitiveMotionGateReason };

export type CompetitivePreflightResult =
  | { ok: true }
  | { ok: false; block: CompetitivePreflightBlock };

// Folds the sequenced step results into the single entry decision. Location, motion, and (on
// Android) battery are the blocking gates; notifications state is accepted here precisely to pin
// the policy that the soft step can NEVER block a competitive entry.
export function combineCompetitivePreflight(input: {
  // null = battery was skipped because an earlier gate already blocked (the wiring never runs
  // later steps after a block).
  battery: CompetitiveBatteryGateResult | null;
  location: CompetitiveLocationGateResult;
  // null = motion was skipped because the location gate already blocked.
  motion: CompetitiveMotionGateResult | null;
  notificationsGranted: boolean;
}): CompetitivePreflightResult {
  if (!input.location.ok) {
    return { block: { kind: 'location', reason: input.location.reason }, ok: false };
  }

  if (input.motion && !input.motion.ok) {
    return { block: { kind: 'motion', reason: input.motion.reason }, ok: false };
  }

  if (input.battery && !input.battery.ok) {
    return { block: { kind: 'battery', reason: input.battery.reason }, ok: false };
  }

  // notificationsGranted intentionally unread beyond this point: the soft step is best-effort and
  // never blocking.
  return { ok: true };
}
