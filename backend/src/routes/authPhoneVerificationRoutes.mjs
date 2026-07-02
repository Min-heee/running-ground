import {
  SMS_GLOBAL_PER_DAY,
  SMS_PER_IP_PER_HOUR,
  SMS_PER_PHONE_PER_DAY,
  SMS_UNIQUE_PHONES_PER_IP_PER_DAY,
  TRUST_PROXY,
} from '../config.mjs';
import { createSmsRequestCodeGuard, resolveClientIp } from '../lib/rateLimiter.mjs';
import { logBackendError } from '../response/httpResponse.mjs';

// request-code는 호출마다 실제 solapi SMS를 발송하므로(= 과금) 프로세스 수명 동안
// 공유되는 계층형 rate limit 가드를 둔다. 테스트에서는 routeContext로 교체 주입한다.
const defaultSmsRequestCodeGuard = createSmsRequestCodeGuard({
  perIpPerHour: SMS_PER_IP_PER_HOUR,
  uniquePhonesPerIpPerDay: SMS_UNIQUE_PHONES_PER_IP_PER_DAY,
  perPhonePerDay: SMS_PER_PHONE_PER_DAY,
  globalPerDay: SMS_GLOBAL_PER_DAY,
});

export async function routeAuthPhoneVerificationRequest({
  method,
  pathname,
  request,
  response,
  sendJson,
  mutateStore,
  smsRequestCodeGuard = defaultSmsRequestCodeGuard,
  trustProxy = TRUST_PROXY,
  buildPhoneVerificationPayload,
  buildPhoneVerificationSuccessPayload,
  cleanupPhoneVerificationChallenges,
  createPhoneVerificationChallenge,
  createToken,
  ensurePhoneVerificationChallenges,
  hashPhoneVerificationCode,
  phoneVerificationService,
  validatePhoneNumber,
  validatePhoneVerificationCode,
  validatePhoneVerificationPurpose,
  validateRequiredString,
  parseJsonBody,
  PHONE_VERIFICATION_VERIFIED_TTL_MS,
  ApiError,
}) {
  if (pathname === '/api/auth/phone/request-code' && method === 'POST') {
    await handleRequestPhoneVerificationCode({
      ApiError,
      buildPhoneVerificationPayload,
      cleanupPhoneVerificationChallenges,
      createPhoneVerificationChallenge,
      ensurePhoneVerificationChallenges,
      mutateStore,
      parseJsonBody,
      phoneVerificationService,
      request,
      response,
      sendJson,
      smsRequestCodeGuard,
      trustProxy,
      validatePhoneNumber,
      validatePhoneVerificationPurpose,
    });
    return true;
  }

  if (pathname === '/api/auth/phone/verify-code' && method === 'POST') {
    await handleVerifyPhoneVerificationCode({
      ApiError,
      buildPhoneVerificationSuccessPayload,
      cleanupPhoneVerificationChallenges,
      createToken,
      ensurePhoneVerificationChallenges,
      hashPhoneVerificationCode,
      mutateStore,
      parseJsonBody,
      PHONE_VERIFICATION_VERIFIED_TTL_MS,
      request,
      response,
      sendJson,
      validatePhoneVerificationCode,
      validatePhoneVerificationPurpose,
      validateRequiredString,
    });
    return true;
  }

  return false;
}

async function handleRequestPhoneVerificationCode({
  ApiError,
  buildPhoneVerificationPayload,
  cleanupPhoneVerificationChallenges,
  createPhoneVerificationChallenge,
  ensurePhoneVerificationChallenges,
  mutateStore,
  parseJsonBody,
  phoneVerificationService,
  request,
  response,
  sendJson,
  smsRequestCodeGuard,
  trustProxy,
  validatePhoneNumber,
  validatePhoneVerificationPurpose,
}) {
  const body = await parseJsonBody(request);
  const purpose = validatePhoneVerificationPurpose(body.purpose);
  const phone = validatePhoneNumber(body.phone);
  const now = new Date();

  const clientIp = resolveClientIp(request, { trustProxy });
  const rateDecision = smsRequestCodeGuard.check({ ip: clientIp, phone, now: now.getTime() });

  if (!rateDecision.allowed) {
    if (rateDecision.reason === 'global') {
      // 전역 일일 한도는 서비스 전체 SMS 예산 소진 신호라 시끄럽게 남긴다.
      logBackendError('sms_global_daily_limit_exceeded', new Error('SMS 전역 일일 발송 한도를 초과했어요.'), {
        clientIp,
        phone,
      });
      throw new ApiError(429, '지금은 인증번호 요청이 많아요. 잠시 후 다시 시도해주세요.', {
        retryAfterSeconds: rateDecision.retryAfterSeconds,
      });
    }

    throw new ApiError(429, '인증번호 요청이 너무 많아요. 잠시 후 다시 시도해주세요.', {
      retryAfterSeconds: rateDecision.retryAfterSeconds,
    });
  }

  let createdChallenge = null;
  let rawCode = '';

  await mutateStore((store) => {
    cleanupPhoneVerificationChallenges(store, now);
    const challenges = ensurePhoneVerificationChallenges(store);
    const activeChallenge = challenges.find((entry) => (
      entry.purpose === purpose
      && entry.phone === phone
      && entry.status === 'pending'
      && Date.parse(entry.expiresAt) > now.getTime()
    ));

    if (activeChallenge) {
      const resendAvailableAtMs = Date.parse(activeChallenge.resendAvailableAt);

      if (Number.isFinite(resendAvailableAtMs) && resendAvailableAtMs > now.getTime()) {
        const remainingSeconds = Math.max(1, Math.ceil((resendAvailableAtMs - now.getTime()) / 1000));
        throw new ApiError(429, `인증번호를 너무 자주 요청하고 있어요. ${remainingSeconds}초 뒤에 다시 시도해주세요.`);
      }
    }

    const { challenge, code } = createPhoneVerificationChallenge({
      purpose,
      phone,
      now,
    });

    for (const existingChallenge of challenges) {
      if (existingChallenge.phone === phone && existingChallenge.purpose === purpose && existingChallenge.status === 'pending') {
        existingChallenge.status = 'superseded';
        existingChallenge.updatedAt = now.toISOString();
      }
    }

    challenges.push(challenge);
    createdChallenge = challenge;
    rawCode = code;
  });

  try {
    const providerResult = await phoneVerificationService.sendCode({
      phone,
      code: rawCode,
      purpose,
    });
    sendJson(response, 200, buildPhoneVerificationPayload(createdChallenge, providerResult));
  } catch (error) {
    await mutateStore((store) => {
      cleanupPhoneVerificationChallenges(store);
      store.phoneVerificationChallenges = ensurePhoneVerificationChallenges(store)
        .filter((entry) => entry.id !== createdChallenge?.id);
    });
    throw new ApiError(502, error instanceof Error ? error.message : '인증번호 발송에 실패했어요.');
  }
}

async function handleVerifyPhoneVerificationCode({
  ApiError,
  buildPhoneVerificationSuccessPayload,
  cleanupPhoneVerificationChallenges,
  createToken,
  ensurePhoneVerificationChallenges,
  hashPhoneVerificationCode,
  mutateStore,
  parseJsonBody,
  PHONE_VERIFICATION_VERIFIED_TTL_MS,
  request,
  response,
  sendJson,
  validatePhoneVerificationCode,
  validatePhoneVerificationPurpose,
  validateRequiredString,
}) {
  const body = await parseJsonBody(request);
  const requestId = validateRequiredString(body.requestId, '인증 요청을 먼저 시작해주세요.');
  const purpose = validatePhoneVerificationPurpose(body.purpose);
  const code = validatePhoneVerificationCode(body.code);
  const now = new Date();
  let verifiedChallenge = null;

  await mutateStore((store) => {
    cleanupPhoneVerificationChallenges(store, now);
    const challenge = ensurePhoneVerificationChallenges(store).find((entry) => entry.id === requestId && entry.purpose === purpose);

    if (!challenge) {
      throw new ApiError(404, '인증 요청을 찾을 수 없어요. 다시 인증번호를 요청해주세요.');
    }

    if (challenge.status === 'verified' && challenge.verifiedToken && challenge.registrationExpiresAt) {
      verifiedChallenge = challenge;
      return;
    }

    if (challenge.status !== 'pending') {
      throw new ApiError(400, '이미 만료되었거나 사용할 수 없는 인증 요청이에요. 다시 시도해주세요.');
    }

    const expiresAtMs = Date.parse(challenge.expiresAt);

    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) {
      challenge.status = 'expired';
      challenge.updatedAt = now.toISOString();
      throw new ApiError(400, '인증번호가 만료됐어요. 다시 요청해주세요.');
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      challenge.status = 'locked';
      challenge.updatedAt = now.toISOString();
      throw new ApiError(429, '인증 시도 횟수를 초과했어요. 새 인증번호를 다시 요청해주세요.');
    }

    if (challenge.codeHash !== hashPhoneVerificationCode(challenge.id, code)) {
      challenge.attempts += 1;
      challenge.updatedAt = now.toISOString();

      if (challenge.attempts >= challenge.maxAttempts) {
        challenge.status = 'locked';
        throw new ApiError(429, '인증 시도 횟수를 초과했어요. 새 인증번호를 다시 요청해주세요.');
      }

      throw new ApiError(400, '인증번호가 맞지 않아요.');
    }

    challenge.status = 'verified';
    challenge.verifiedAt = now.toISOString();
    challenge.registrationExpiresAt = new Date(now.getTime() + PHONE_VERIFICATION_VERIFIED_TTL_MS).toISOString();
    challenge.verifiedToken = createToken();
    challenge.updatedAt = now.toISOString();
    verifiedChallenge = challenge;
  });

  sendJson(response, 200, buildPhoneVerificationSuccessPayload(verifiedChallenge));
}
