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

// CHASE_MODE_ENABLED: 경찰과 도둑 진입점 숨김 (오너 2026-08-03). 기능·백엔드·정산은
// 전부 살아 있고 러닝 탭 모드 카탈로그에서만 빠진다 — 다시 켤 때 이 플래그만 true로
// 바꿔 OTA. 혼자 묶음은 solo 하나만 남아 카드 없이 히어로 패널만 보인다
// (buildMatchOptionSegments가 빈/단일 묶음을 알아서 정리).
export const CHASE_MODE_ENABLED = false;

// Whether the social-login block (divider + provider buttons) should render at all.
// Kept as a pure predicate so the gate decision is unit-testable without React.
export function isSocialLoginEnabled(): boolean {
  return SOCIAL_LOGIN_ENABLED;
}
