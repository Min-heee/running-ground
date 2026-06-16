import { ApiError } from '../response/httpResponse.mjs';
import { nextId } from '../lib/idHelpers.mjs';
import {
  generatePhoneVerificationCode,
  hashPhoneVerificationCode,
  maskPhoneNumber,
} from '../phoneVerification.mjs';

export function createPhoneVerificationHelpers({
  cleanupPhoneVerificationChallenges,
  ensurePhoneVerificationChallenges,
  loadStore,
  phoneVerificationCodeTtlMs,
  phoneVerificationMaxAttempts,
  phoneVerificationProvider,
  phoneVerificationResendCooldownMs,
}) {
  function buildPhoneVerificationPayload(challenge, providerResult = {}) {
    return {
      success: true,
      purpose: challenge.purpose,
      requestId: challenge.id,
      maskedPhone: maskPhoneNumber(challenge.phone),
      expiresAt: challenge.expiresAt,
      resendAvailableAt: challenge.resendAvailableAt,
      provider: providerResult.provider ?? phoneVerificationProvider,
      ...(typeof providerResult.testCode === 'string' ? { testCode: providerResult.testCode } : {}),
    };
  }

  function buildPhoneVerificationSuccessPayload(challenge) {
    return {
      success: true,
      purpose: challenge.purpose,
      phone: challenge.phone,
      maskedPhone: maskPhoneNumber(challenge.phone),
      verifiedAt: challenge.verifiedAt,
      registrationExpiresAt: challenge.registrationExpiresAt,
      verifiedToken: challenge.verifiedToken,
    };
  }

  function createPhoneVerificationChallenge({ purpose, phone, now = new Date() }) {
    const requestId = nextId('phone');
    const code = generatePhoneVerificationCode();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + phoneVerificationCodeTtlMs).toISOString();
    const resendAvailableAt = new Date(now.getTime() + phoneVerificationResendCooldownMs).toISOString();

    return {
      challenge: {
        id: requestId,
        purpose,
        phone,
        codeHash: hashPhoneVerificationCode(requestId, code),
        attempts: 0,
        maxAttempts: phoneVerificationMaxAttempts,
        status: 'pending',
        createdAt,
        updatedAt: createdAt,
        expiresAt,
        resendAvailableAt,
        verifiedAt: '',
        registrationExpiresAt: '',
        verifiedToken: '',
        consumedAt: '',
      },
      code,
    };
  }

  async function requireVerifiedPhoneChallenge({
    phone,
    verifiedToken,
  }) {
    const store = await loadStore();
    cleanupPhoneVerificationChallenges(store);
    const challenge = ensurePhoneVerificationChallenges(store).find((entry) => (
      entry.purpose === 'signup'
      && entry.status === 'verified'
      && entry.verifiedToken === verifiedToken
      && entry.phone === phone
    ));

    if (!challenge) {
      throw new ApiError(400, '휴대폰 인증을 먼저 완료해주세요.');
    }

    return challenge;
  }

  return {
    buildPhoneVerificationPayload,
    buildPhoneVerificationSuccessPayload,
    createPhoneVerificationChallenge,
    requireVerifiedPhoneChallenge,
  };
}
