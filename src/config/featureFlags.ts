// Compile-time feature flags. These are plain constants that ship inside the
// JS bundle — flipping one goes out via OTA (they are not remote/runtime
// toggles, just bundle constants).
//
// SOCIAL_LOGIN_ENABLED: launched OFF (P0-3 — unset backend keys were an App
// Store 2.1 rejection vector). Enabled 2026-07-23 after verifying all three
// providers live in production: /api/auth/{google,kakao,naver}/start each 302
// to the provider's authorize page with real client IDs.
//
// ⚠️ App Review guideline 4.8: with third-party social login visible on iOS,
// the NEXT iOS binary submission should also offer Sign in with Apple
// (expo-apple-authentication + entitlement — native work, tracked as a to-do
// before the next 심사 제출).
export const SOCIAL_LOGIN_ENABLED = true;

// Whether the social-login block (divider + provider buttons) should render at all.
// Kept as a pure predicate so the gate decision is unit-testable without React.
export function isSocialLoginEnabled(): boolean {
  return SOCIAL_LOGIN_ENABLED;
}
