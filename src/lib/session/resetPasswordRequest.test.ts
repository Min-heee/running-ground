import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMockResetPhoneVerification,
  createMockSignupPhoneVerification,
  verifyMockResetPhoneCode,
  verifyMockSignupPhoneCode,
} from '@/lib/session/phoneVerification';
import { buildResetPasswordRequestBody } from '@/lib/session/resetPasswordRequest';
import type { ResetPasswordInput } from '@/lib/session/types';

const validResetInput: ResetPasswordInput = {
  username: '  Demo-User ',
  realName: '  홍길동  ',
  phone: '010-1234-5678',
  birthDate: ' 1990-01-01 ',
  newPassword: 'Abcd1234',
  phoneVerificationToken: '  reset-token-xyz  ',
};

// --- reset phone-verification mock actions (mirror signup, purpose:'reset') ---

test('reset mock phone-verify issues a reset-purpose request and verifies with the test code', () => {
  const requested = createMockResetPhoneVerification('01012345678');
  assert.equal(requested.purpose, 'reset');
  assert.equal(requested.provider, 'mock');
  assert.equal(requested.testCode, '123456');
  assert.match(requested.requestId, /^mock-phone-reset-/);

  const verified = verifyMockResetPhoneCode(requested.requestId, '123456');
  assert.equal(verified.purpose, 'reset');
  assert.match(verified.verifiedToken, /^mock-phone-token-reset-/);
});

test('reset mock verify rejects a wrong code and an unknown requestId', () => {
  const requested = createMockResetPhoneVerification('01012345678');
  assert.throws(() => verifyMockResetPhoneCode(requested.requestId, '000000'), /인증번호/);
  assert.throws(() => verifyMockResetPhoneCode('not-a-real-request', '123456'), /만료/);
});

test('reset and signup mock challenges do not clobber each other', () => {
  const signup = createMockSignupPhoneVerification('01011112222');
  const reset = createMockResetPhoneVerification('01033334444');

  // Verifying reset must not consume/invalidate the still-pending signup challenge.
  const resetVerified = verifyMockResetPhoneCode(reset.requestId, '123456');
  assert.equal(resetVerified.purpose, 'reset');

  const signupVerified = verifyMockSignupPhoneCode(signup.requestId, '123456');
  assert.equal(signupVerified.purpose, 'signup');
});

// --- reset-password request body (validation + token passing) ---

test('reset-password body carries the verified phone token and normalizes fields', () => {
  const body = buildResetPasswordRequestBody(validResetInput);

  assert.equal(body.phoneVerificationToken, 'reset-token-xyz');
  assert.equal(body.username, 'demo-user');
  assert.equal(body.realName, '홍길동');
  assert.equal(body.phone, '01012345678');
  assert.equal(body.birthDate, '1990-01-01');
  assert.equal(body.newPassword, 'Abcd1234');
});

test('reset-password body rejects a missing / blank phone token (backend requires it)', () => {
  assert.throws(
    () => buildResetPasswordRequestBody({ ...validResetInput, phoneVerificationToken: undefined }),
    /휴대폰 인증/,
  );
  assert.throws(
    () => buildResetPasswordRequestBody({ ...validResetInput, phoneVerificationToken: '   ' }),
    /휴대폰 인증/,
  );
});

test('reset-password body validates identity fields before the token', () => {
  assert.throws(() => buildResetPasswordRequestBody({ ...validResetInput, username: 'no' }), /아이디/);
  assert.throws(() => buildResetPasswordRequestBody({ ...validResetInput, realName: '   ' }), /이름/);
  assert.throws(() => buildResetPasswordRequestBody({ ...validResetInput, phone: '010-1' }), /휴대폰 번호/);
  assert.throws(() => buildResetPasswordRequestBody({ ...validResetInput, birthDate: '1990/01/01' }), /생년월일/);
  assert.throws(() => buildResetPasswordRequestBody({ ...validResetInput, newPassword: 'short' }), /비밀번호/);
});
