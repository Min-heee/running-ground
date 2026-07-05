import type {
  FindUsernameResponse,
  RequestPhoneVerificationCodeResponse,
  ResetPasswordResponse,
  VerifyPhoneVerificationCodeResponse,
} from '@/lib/api/types';
import type {
  FindUsernameInput,
  ResetPasswordInput,
} from '@/lib/session/types';
import {
  createMockResetPhoneVerification,
  verifyMockResetPhoneCode,
} from '@/lib/session/phoneVerification';
import { buildResetPasswordRequestBody } from '@/lib/session/resetPasswordRequest';
import { apiPost, USE_MOCK_API } from '@/services/apiClient';
import { ensureHydrated } from './sessionState';

export async function findUsernameByIdentity({
  realName,
  phone,
  birthDate,
}: FindUsernameInput) {
  await ensureHydrated();

  const normalizedRealName = realName.trim();
  const normalizedPhone = phone.replace(/\D/g, '');
  const normalizedBirthDate = birthDate.trim();

  if (!normalizedRealName) {
    throw new Error('이름을 입력해주세요.');
  }

  if (normalizedPhone.length < 10) {
    throw new Error('휴대폰 번호를 정확히 입력해주세요.');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedBirthDate)) {
    throw new Error('생년월일은 YYYY-MM-DD 형식으로 입력해주세요.');
  }

  if (USE_MOCK_API) {
    return {
      success: true,
      username: 'demo-user',
      maskedPhone: `${normalizedPhone.slice(0, 3)}-****-${normalizedPhone.slice(-4)}`,
    } satisfies FindUsernameResponse;
  }

  return apiPost<FindUsernameResponse>(
    '/auth/find-username',
    {
      realName: normalizedRealName,
      phone: normalizedPhone,
      birthDate: normalizedBirthDate,
    },
    { fallbackMessage: '아이디를 찾지 못했어요.' },
  );
}

// Reset-password phone verification (P0-1). Mirrors the signup phone-verify actions
// but tags the challenge with purpose:'reset' so the backend issues a token the
// reset endpoint will accept. The mock path shares the same 6-digit test code UX.
export async function requestResetPhoneVerification(rawPhone: string): Promise<RequestPhoneVerificationCodeResponse> {
  await ensureHydrated();

  const normalizedPhone = rawPhone.replace(/\D/g, '');

  if (normalizedPhone.length < 10) {
    throw new Error('휴대폰 번호를 정확히 입력해주세요.');
  }

  if (USE_MOCK_API) {
    return createMockResetPhoneVerification(normalizedPhone);
  }

  return apiPost<RequestPhoneVerificationCodeResponse>(
    '/auth/phone/request-code',
    {
      phone: normalizedPhone,
      purpose: 'reset',
    },
    { fallbackMessage: '인증번호 발송에 실패했어요.' },
  );
}

export async function verifyResetPhoneCode(
  requestId: string,
  rawCode: string,
): Promise<VerifyPhoneVerificationCodeResponse> {
  await ensureHydrated();

  const normalizedRequestId = requestId.trim();
  const normalizedCode = rawCode.replace(/\D/g, '').slice(0, 6);

  if (!normalizedRequestId) {
    throw new Error('인증 요청을 먼저 시작해주세요.');
  }

  if (normalizedCode.length !== 6) {
    throw new Error('인증번호 6자리를 입력해주세요.');
  }

  if (USE_MOCK_API) {
    return verifyMockResetPhoneCode(normalizedRequestId, normalizedCode);
  }

  return apiPost<VerifyPhoneVerificationCodeResponse>(
    '/auth/phone/verify-code',
    {
      requestId: normalizedRequestId,
      code: normalizedCode,
      purpose: 'reset',
    },
    { fallbackMessage: '인증번호 확인에 실패했어요.' },
  );
}

export async function resetPasswordByIdentity(input: ResetPasswordInput) {
  await ensureHydrated();

  // Validates every field, requires the verified 'reset' phone token, and shapes
  // the exact POST body — throws a user-facing Error on the first invalid field.
  const requestBody = buildResetPasswordRequestBody(input);

  if (USE_MOCK_API) {
    return {
      success: true,
      username: requestBody.username,
      message: '비밀번호를 새로 바꿨어요. 이제 새 비밀번호로 로그인해주세요.',
    } satisfies ResetPasswordResponse;
  }

  return apiPost<ResetPasswordResponse>(
    '/auth/reset-password',
    requestBody,
    { fallbackMessage: '비밀번호를 재설정하지 못했어요.' },
  );
}
