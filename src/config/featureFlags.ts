// Compile-time feature flags. These are plain constants that ship inside the
// store bundle (NOT remote/runtime toggles) — flipping one requires a new build.
//
// SOCIAL_LOGIN_ENABLED (P0-3): the 카카오/네이버/구글 buttons render a full OAuth
// flow, but the backend OAuth keys are unset, so a reviewer tapping one hits a
// 503/throw — an App Store Review Guideline 2.1 (non-functional feature) rejection
// vector. Ship with this OFF so the buttons never render; the component and the
// backend wiring stay intact for a later enablement (just flip this to true and
// cut a build once the provider keys are configured).
export const SOCIAL_LOGIN_ENABLED = false;

// Whether the social-login block (divider + provider buttons) should render at all.
// Kept as a pure predicate so the gate decision is unit-testable without React.
export function isSocialLoginEnabled(): boolean {
  return SOCIAL_LOGIN_ENABLED;
}
