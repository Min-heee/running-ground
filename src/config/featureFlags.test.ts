import assert from 'node:assert/strict';
import test from 'node:test';
import { SOCIAL_LOGIN_ENABLED, isSocialLoginEnabled } from '@/config/featureFlags';

// P0-3: the social-login block must be gated OFF for the store build so a reviewer
// can't tap a provider whose backend keys are unset (App Store 2.1 rejection vector).
// SocialLoginButtons returns null when this predicate is false, so a false flag is
// what makes the whole block (divider + buttons) render nothing.
test('social login ships disabled (compile-time flag is false)', () => {
  assert.equal(SOCIAL_LOGIN_ENABLED, false);
  assert.equal(isSocialLoginEnabled(), false);
});

test('the gate predicate tracks the constant', () => {
  assert.equal(isSocialLoginEnabled(), SOCIAL_LOGIN_ENABLED);
});
