import type {
  AuthResponse,
  RequestPhoneVerificationCodeResponse,
  UsernameAvailabilityResponse,
  VerifyPhoneVerificationCodeResponse,
} from '@/lib/api/types';
import {
  createMockSignupPhoneVerification,
  verifyMockSignupPhoneCode,
} from '@/lib/session/phoneVerification';
import type { RegisterAccountInput } from '@/lib/session/types';
import {
  getPasswordValidationError,
  getUsernameValidationError,
  normalizeUsername,
} from '@/lib/session/validation';
import { apiGet, apiPost, USE_MOCK_API } from '@/services/apiClient';
import {
  applyBackendAuthSession,
  applyMockRegisteredProfile,
  ensureHydrated,
} from './sessionState';

const MOCK_TAKEN_USERNAMES = new Set([
  'demo-user',
  'kw-user',
  'sj-user',
  'jh-user',
  'mj-user',
  'sy-user',
  'dy-user',
  'yr-user',
  'ia-user',
]);

export async function checkUsernameAvailability(rawUsername: string): Promise<UsernameAvailabilityResponse> {
  await ensureHydrated();

  const username = normalizeUsername(rawUsername);
  const usernameValidationError = getUsernameValidationError(username);

  if (usernameValidationError) {
    throw new Error(usernameValidationError);
  }

  if (USE_MOCK_API) {
    const available = !MOCK_TAKEN_USERNAMES.has(username);

    return {
      username,
      available,
      message: available ? '사용할 수 있는 아이디예요.' : '이미 사용 중인 아이디예요.',
    };
  }

  return apiGet<UsernameAvailabilityResponse>(
    `/auth/check-username?username=${encodeURIComponent(username)}`,
    { fallbackMessage: '아이디 중복 확인에 실패했어요.' },
  );
}

export async function requestSignupPhoneVerification(rawPhone: string): Promise<RequestPhoneVerificationCodeResponse> {
  await ensureHydrated();

  const normalizedPhone = rawPhone.replace(/\D/g, '');

  if (normalizedPhone.length < 10) {
    throw new Error('휴대폰 번호를 정확히 입력해주세요.');
  }

  if (USE_MOCK_API) {
    return createMockSignupPhoneVerification(normalizedPhone);
  }

  return apiPost<RequestPhoneVerificationCodeResponse>(
    '/auth/phone/request-code',
    {
      phone: normalizedPhone,
      purpose: 'signup',
    },
    { fallbackMessage: '인증번호 발송에 실패했어요.' },
  );
}

export async function verifySignupPhoneCode(
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
    return verifyMockSignupPhoneCode(normalizedRequestId, normalizedCode);
  }

  return apiPost<VerifyPhoneVerificationCodeResponse>(
    '/auth/phone/verify-code',
    {
      requestId: normalizedRequestId,
      code: normalizedCode,
      purpose: 'signup',
    },
    { fallbackMessage: '인증번호 확인에 실패했어요.' },
  );
}

export async function registerAccount({
  username,
  password,
  nickname,
  realName,
  displayNamePreference,
  phone,
  provinceName,
  cityName,
  districtName,
  universityName,
  addressDetail,
  birthDate,
}: RegisterAccountInput) {
  await ensureHydrated();

  const normalizedNickname = nickname.trim();
  const normalizedRealName = realName.trim();
  const normalizedDisplayName = displayNamePreference === 'realName' ? normalizedRealName : normalizedNickname;
  const normalizedUsername = normalizeUsername(username);
  const normalizedPhone = phone.replace(/\D/g, '');
  const normalizedProvinceName = provinceName.trim();
  const normalizedCityName = cityName?.trim() ?? '';
  const normalizedDistrictName = districtName.trim();
  const normalizedUniversityName = universityName?.trim() ?? '';
  const normalizedAddressDetail = addressDetail.trim();
  const normalizedBirthDate = birthDate.trim();

  if (displayNamePreference === 'nickname' && !normalizedNickname) {
    throw new Error('닉네임을 입력해주세요.');
  }

  if (!normalizedRealName) {
    throw new Error('이름을 입력해주세요.');
  }

  if (!normalizedDisplayName) {
    throw new Error('공개 표시 이름을 선택해주세요.');
  }

  const usernameValidationError = getUsernameValidationError(normalizedUsername);

  if (usernameValidationError) {
    throw new Error(usernameValidationError);
  }

  const passwordValidationError = getPasswordValidationError(password);

  if (passwordValidationError) {
    throw new Error(passwordValidationError);
  }

  if (normalizedPhone.length < 10) {
    throw new Error('휴대폰 번호를 정확히 입력해주세요.');
  }

  if (!normalizedProvinceName) {
    throw new Error('시/도를 먼저 선택해주세요.');
  }

  if (!normalizedDistrictName) {
    throw new Error('최종 지역을 선택해주세요.');
  }

  if (!normalizedAddressDetail) {
    throw new Error('상세 주소를 입력해주세요.');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedBirthDate)) {
    throw new Error('생년월일은 YYYY-MM-DD 형식으로 입력해주세요.');
  }

  if (USE_MOCK_API) {
    return applyMockRegisteredProfile({
      addressDetail: normalizedAddressDetail,
      cityName: normalizedCityName,
      displayName: normalizedDisplayName,
      districtName: normalizedDistrictName,
      provinceName: normalizedProvinceName,
      universityName: normalizedUniversityName,
    });
  }

  const authResponse = await apiPost<AuthResponse>(
    '/auth/register',
    {
      username: normalizedUsername,
      password: password.trim(),
      nickname: normalizedDisplayName,
      name: normalizedDisplayName,
      realName: normalizedRealName,
      phone: normalizedPhone,
      provinceName: normalizedProvinceName,
      cityName: normalizedCityName,
      districtName: normalizedDistrictName,
      universityName: normalizedUniversityName,
      addressDetail: normalizedAddressDetail,
      birthDate: normalizedBirthDate,
    },
    { fallbackMessage: '회원가입에 실패했어요.' },
  );

  return applyBackendAuthSession(authResponse);
}
