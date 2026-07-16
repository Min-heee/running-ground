import type {
  PhoneVerificationPurpose,
  RequestPhoneVerificationCodeResponse,
  VerifyPhoneVerificationCodeResponse,
} from '@/lib/api/types';

// One in-flight mock challenge per purpose, so a signup request never clobbers an
// in-progress reset challenge (or vice versa) when both mock flows are exercised.
type MockPhoneVerificationSession = {
  requestId: string;
  phone: string;
  code: string;
  verifiedToken: string | null;
};

const mockPhoneVerificationSessions: Partial<Record<PhoneVerificationPurpose, MockPhoneVerificationSession>> = {};

function maskPhone(phone: string) {
  return `${phone.slice(0, 3)}-****-${phone.slice(-4)}`;
}

function createMockPhoneVerification(
  purpose: PhoneVerificationPurpose,
  normalizedPhone: string,
): RequestPhoneVerificationCodeResponse {
  const requestId = `mock-phone-${purpose}-${Date.now()}`;
  const testCode = '123456';
  mockPhoneVerificationSessions[purpose] = {
    requestId,
    phone: normalizedPhone,
    code: testCode,
    verifiedToken: null,
  };

  return {
    success: true,
    purpose,
    requestId,
    maskedPhone: maskPhone(normalizedPhone),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    resendAvailableAt: new Date(Date.now() + 60 * 1000).toISOString(),
    provider: 'mock',
    testCode,
  };
}

function verifyMockPhoneCode(
  purpose: PhoneVerificationPurpose,
  normalizedRequestId: string,
  normalizedCode: string,
): VerifyPhoneVerificationCodeResponse {
  const session = mockPhoneVerificationSessions[purpose];

  if (!session || session.requestId !== normalizedRequestId) {
    throw new Error('인증 요청이 만료됐어요. 다시 요청해주세요.');
  }

  if (session.code !== normalizedCode) {
    throw new Error('인증번호가 맞지 않아요.');
  }

  const verifiedToken = `mock-phone-token-${purpose}-${Date.now()}`;
  session.verifiedToken = verifiedToken;

  return {
    success: true,
    purpose,
    phone: session.phone,
    maskedPhone: maskPhone(session.phone),
    verifiedAt: new Date().toISOString(),
    registrationExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    verifiedToken,
  };
}

export function createMockSignupPhoneVerification(
  normalizedPhone: string,
): RequestPhoneVerificationCodeResponse {
  return createMockPhoneVerification('signup', normalizedPhone);
}

export function verifyMockSignupPhoneCode(
  normalizedRequestId: string,
  normalizedCode: string,
): VerifyPhoneVerificationCodeResponse {
  return verifyMockPhoneCode('signup', normalizedRequestId, normalizedCode);
}

export function createMockResetPhoneVerification(
  normalizedPhone: string,
): RequestPhoneVerificationCodeResponse {
  return createMockPhoneVerification('reset', normalizedPhone);
}

export function verifyMockResetPhoneCode(
  normalizedRequestId: string,
  normalizedCode: string,
): VerifyPhoneVerificationCodeResponse {
  return verifyMockPhoneCode('reset', normalizedRequestId, normalizedCode);
}

export function createMockFindUsernamePhoneVerification(
  normalizedPhone: string,
): RequestPhoneVerificationCodeResponse {
  return createMockPhoneVerification('find_username', normalizedPhone);
}

export function verifyMockFindUsernamePhoneCode(
  normalizedRequestId: string,
  normalizedCode: string,
): VerifyPhoneVerificationCodeResponse {
  return verifyMockPhoneCode('find_username', normalizedRequestId, normalizedCode);
}
