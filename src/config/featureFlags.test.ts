import assert from 'node:assert/strict';
import test from 'node:test';
import { SOCIAL_LOGIN_ENABLED, isSocialLoginEnabled } from '@/config/featureFlags';

// Enabled 2026-07-23: all three provider keys are live in production (each
// /api/auth/<provider>/start 302s to the real authorize page), so the buttons
// are safe to render. SocialLoginButtons returns null when the predicate is
// false — this test pins the intentional ON state.
test('social login is enabled (compile-time flag is true)', () => {
  assert.equal(SOCIAL_LOGIN_ENABLED, true);
  assert.equal(isSocialLoginEnabled(), true);
});

test('the gate predicate tracks the constant', () => {
  assert.equal(isSocialLoginEnabled(), SOCIAL_LOGIN_ENABLED);
});
