import type {
  RequestPhoneVerificationCodeResponse,
  VerifyPhoneVerificationCodeResponse,
} from '@/lib/api/types';

let mockPhoneVerificationSession: {
  requestId: string;
  phone: string;
  code: string;
  verifiedToken: string | null;
} | null = null;

function maskPhone(phone: string) {
  return `${phone.slice(0, 3)}-****-${phone.slice(-4)}`;
}

export function createMockSignupPhoneVerification(
  normalizedPhone: string,
): RequestPhoneVerificationCodeResponse {
  const requestId = `mock-phone-${Date.now()}`;
  const testCode = '123456';
  mockPhoneVerificationSession = {
    requestId,
    phone: normalizedPhone,
    code: testCode,
    verifiedToken: null,
  };

  return {
    success: true,
    purpose: 'signup',
    requestId,
    maskedPhone: maskPhone(normalizedPhone),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    resendAvailableAt: new Date(Date.now() + 60 * 1000).toISOString(),
    provider: 'mock',
    testCode,
  };
}

export function verifyMockSignupPhoneCode(
  normalizedRequestId: string,
  normalizedCode: string,
): VerifyPhoneVerificationCodeResponse {
  if (!mockPhoneVerificationSession || mockPhoneVerificationSession.requestId !== normalizedRequestId) {
    throw new Error('인증 요청이 만료됐어요. 다시 요청해주세요.');
  }

  if (mockPhoneVerificationSession.code !== normalizedCode) {
    throw new Error('인증번호가 맞지 않아요.');
  }

  const verifiedToken = `mock-phone-token-${Date.now()}`;
  mockPhoneVerificationSession.verifiedToken = verifiedToken;

  return {
    success: true,
    purpose: 'signup',
    phone: mockPhoneVerificationSession.phone,
    maskedPhone: maskPhone(mockPhoneVerificationSession.phone),
    verifiedAt: new Date().toISOString(),
    registrationExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    verifiedToken,
  };
}
