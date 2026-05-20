import type {
  FindUsernameResponse,
  ResetPasswordResponse,
} from '@/lib/api/types';
import type {
  FindUsernameInput,
  ResetPasswordInput,
} from '@/lib/session/types';
import {
  getPasswordValidationError,
  getUsernameValidationError,
  normalizeUsername,
} from '@/lib/session/validation';
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

export async function resetPasswordByIdentity({
  username,
  realName,
  phone,
  birthDate,
  newPassword,
}: ResetPasswordInput) {
  await ensureHydrated();

  const normalizedUsername = normalizeUsername(username);
  const normalizedRealName = realName.trim();
  const normalizedPhone = phone.replace(/\D/g, '');
  const normalizedBirthDate = birthDate.trim();
  const passwordValidationError = getPasswordValidationError(newPassword);

  if (getUsernameValidationError(normalizedUsername)) {
    throw new Error('아이디를 정확히 입력해주세요.');
  }

  if (!normalizedRealName) {
    throw new Error('이름을 입력해주세요.');
  }

  if (normalizedPhone.length < 10) {
    throw new Error('휴대폰 번호를 정확히 입력해주세요.');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedBirthDate)) {
    throw new Error('생년월일은 YYYY-MM-DD 형식으로 입력해주세요.');
  }

  if (passwordValidationError) {
    throw new Error(passwordValidationError);
  }

  if (USE_MOCK_API) {
    return {
      success: true,
      username: normalizedUsername,
      message: '비밀번호를 새로 바꿨어요. 이제 새 비밀번호로 로그인해주세요.',
    } satisfies ResetPasswordResponse;
  }

  return apiPost<ResetPasswordResponse>(
    '/auth/reset-password',
    {
      username: normalizedUsername,
      realName: normalizedRealName,
      phone: normalizedPhone,
      birthDate: normalizedBirthDate,
      newPassword: newPassword.trim(),
    },
    { fallbackMessage: '비밀번호를 재설정하지 못했어요.' },
  );
}
