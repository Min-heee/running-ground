// Pure request-shaping for reset-password (P0-1). Kept free of any react-native /
// apiClient import so the validation + body assembly — including that the verified
// phone token is carried into the POST body — is unit-testable in the node runner.
import type { ResetPasswordInput } from '@/lib/session/types';
import {
  getPasswordValidationError,
  getUsernameValidationError,
  normalizeUsername,
} from '@/lib/session/validation';

export type ResetPasswordRequestBody = {
  username: string;
  realName: string;
  phone: string;
  birthDate: string;
  newPassword: string;
  phoneVerificationToken: string;
};

// Validate + normalize the reset form and assemble the exact POST body. Throws an
// Error (Korean, surfaced to the user) on the first invalid field. The backend now
// REQUIRES a 'reset' phone-verification token, so a missing/blank token is rejected
// here before we ever hit the network.
export function buildResetPasswordRequestBody({
  username,
  realName,
  phone,
  birthDate,
  newPassword,
  phoneVerificationToken,
}: ResetPasswordInput): ResetPasswordRequestBody {
  const normalizedUsername = normalizeUsername(username);
  const normalizedRealName = realName.trim();
  const normalizedPhone = phone.replace(/\D/g, '');
  const normalizedBirthDate = birthDate.trim();
  const normalizedToken = phoneVerificationToken?.trim() ?? '';

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

  const passwordValidationError = getPasswordValidationError(newPassword);

  if (passwordValidationError) {
    throw new Error(passwordValidationError);
  }

  if (!normalizedToken) {
    throw new Error('휴대폰 인증을 먼저 완료해주세요.');
  }

  return {
    username: normalizedUsername,
    realName: normalizedRealName,
    phone: normalizedPhone,
    birthDate: normalizedBirthDate,
    newPassword: newPassword.trim(),
    phoneVerificationToken: normalizedToken,
  };
}
