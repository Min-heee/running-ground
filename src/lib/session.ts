import { myProfile } from '@/data/mock';
import { UserProfile } from '@/domain/types';
import { apiDelete, apiGet, apiPost } from '@/lib/api/client';
import { USE_MOCK_API } from '@/lib/api/config';
import {
  AuthResponse,
  DeleteMyAccountResponse,
  FindUsernameResponse,
  LogoutResponse,
  RequestPhoneVerificationCodeResponse,
  ResetPasswordResponse,
  UsernameAvailabilityResponse,
  VerifyPhoneVerificationCodeResponse,
} from '@/lib/api/types';
import {
  buildBackendSessionSnapshot,
  createBackendSession,
  fetchBackendProfile,
} from '@/lib/session/backendSession';
import {
  createMockSignupPhoneVerification,
  verifyMockSignupPhoneCode,
} from '@/lib/session/phoneVerification';
import { readStoredSession } from '@/lib/session/snapshot';
import {
  clearStoredSessionValue,
  getStoredSessionValue,
  setStoredSessionValue,
} from '@/lib/session/storage';
import type {
  FindUsernameInput,
  RegisterAccountInput,
  ResetPasswordInput,
  SessionSnapshot,
  SignInInput,
} from '@/lib/session/types';
import {
  getPasswordValidationError,
  getUsernameValidationError,
  normalizeUsername,
} from '@/lib/session/validation';

export {
  PASSWORD_RULE_DESCRIPTION,
  USERNAME_RULE_DESCRIPTION,
  getPasswordValidationError,
  getUsernameValidationError,
  normalizeUsername,
} from '@/lib/session/validation';

let hydrated = false;
let mockSignedIn = false;
let mockProfile: UserProfile = { ...myProfile };
let backendAccessToken: string | null = null;
let backendProfile: UserProfile | null = null;

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

async function persistSession() {
  if (USE_MOCK_API) {
    if (!mockSignedIn) {
      await clearStoredSessionValue();
      return;
    }

    const snapshot: SessionSnapshot = {
      mode: 'mock',
      signedIn: true,
      profile: mockProfile,
    };
    await setStoredSessionValue(JSON.stringify(snapshot));
    return;
  }

  if (!backendAccessToken || !backendProfile) {
    await clearStoredSessionValue();
    return;
  }

  const snapshot = buildBackendSessionSnapshot({
    accessToken: backendAccessToken,
    profile: backendProfile,
  });

  if (!snapshot) {
    await clearStoredSessionValue();
    return;
  }

  await setStoredSessionValue(JSON.stringify(snapshot));
}

function setBackendSession(authResponse: AuthResponse) {
  const backendSession = createBackendSession(authResponse);
  backendAccessToken = backendSession.accessToken;
  backendProfile = backendSession.profile;
}

async function ensureHydrated() {
  if (!hydrated) {
    await hydrateSession();
  }
}

export async function hydrateSession() {
  const storedSession = readStoredSession(await getStoredSessionValue());

  if (USE_MOCK_API) {
    mockSignedIn = storedSession?.mode === 'mock' && storedSession.signedIn;
    mockProfile = storedSession?.mode === 'mock' && storedSession.profile ? storedSession.profile : { ...myProfile };
    hydrated = true;
    return mockSignedIn;
  }

  backendAccessToken = storedSession?.mode === 'backend' ? storedSession.accessToken ?? null : null;
  backendProfile = storedSession?.mode === 'backend' ? storedSession.profile ?? null : null;

  if (!backendAccessToken) {
    hydrated = true;
    return false;
  }

  try {
    backendProfile = await fetchBackendProfile(backendAccessToken);
    await persistSession();
  } catch {
    backendAccessToken = null;
    backendProfile = null;
    await persistSession();
  }

  hydrated = true;
  return Boolean(backendAccessToken);
}

export function getIsSignedIn() {
  return USE_MOCK_API ? mockSignedIn : Boolean(backendAccessToken);
}

export function getCurrentUserProfile() {
  if (USE_MOCK_API) {
    return mockSignedIn ? mockProfile : null;
  }

  return backendProfile;
}

export async function setCurrentUserProfile(profile: UserProfile) {
  if (USE_MOCK_API) {
    mockProfile = profile;
    await persistSession();
    return mockProfile;
  }

  backendProfile = profile;
  await persistSession();
  return backendProfile;
}

export async function getAccessToken() {
  await ensureHydrated();
  return USE_MOCK_API ? null : backendAccessToken;
}

export async function signIn(input?: SignInInput) {
  await ensureHydrated();

  if (USE_MOCK_API) {
    mockSignedIn = true;
    await persistSession();
    return mockProfile;
  }

  const username = normalizeUsername(input?.username ?? '');
  const password = input?.password.trim() ?? '';

  if (!username || !password) {
    throw new Error('아이디와 비밀번호를 모두 입력해주세요.');
  }

  const authResponse = await apiPost<AuthResponse>(
    '/auth/login',
    { username, password },
    { fallbackMessage: '로그인에 실패했어요.' },
  );

  setBackendSession(authResponse);
  await persistSession();
  return authResponse.user;
}

export async function signInWithProvider(provider: 'kakao' | 'google' | 'apple' | 'naver') {
  await ensureHydrated();

  if (!USE_MOCK_API) {
    throw new Error(`${provider} 간편 로그인은 아직 준비되지 않았어요. 지금은 계정 로그인으로 진행해주세요.`);
  }

  mockSignedIn = true;
  await persistSession();
  return mockProfile;
}

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

export async function verifySignupPhoneCode(requestId: string, rawCode: string): Promise<VerifyPhoneVerificationCodeResponse> {
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
    mockProfile = {
      ...mockProfile,
      name: normalizedDisplayName,
      provinceName: normalizedProvinceName,
      cityName: normalizedCityName || undefined,
      districtName: normalizedDistrictName,
      universityName: normalizedUniversityName || undefined,
      addressDetail: normalizedAddressDetail,
      publicTag: myProfile.publicTag,
      lifetimeDistanceKm: mockProfile.lifetimeDistanceKm ?? 0,
    };
    mockSignedIn = true;
    await persistSession();
    return mockProfile;
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

  setBackendSession(authResponse);
  await persistSession();
  return authResponse.user;
}

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

export async function signOut() {
  await ensureHydrated();

  if (USE_MOCK_API) {
    mockSignedIn = false;
    mockProfile = { ...myProfile };
    await persistSession();
    return;
  }

  if (backendAccessToken) {
    try {
      await apiPost<LogoutResponse>(
        '/auth/logout',
        {},
        {
          accessToken: backendAccessToken,
          fallbackMessage: '로그아웃 처리에 실패했어요.',
        },
      );
    } catch {
      // Best-effort logout: even if the server call fails, clear local session state.
    }
  }

  backendAccessToken = null;
  backendProfile = null;
  await persistSession();
}

export async function deleteAccount() {
  await ensureHydrated();

  if (USE_MOCK_API) {
    mockSignedIn = false;
    mockProfile = { ...myProfile };
    await persistSession();
    return {
      success: true,
      deletedUserId: 'mock-user',
    } satisfies DeleteMyAccountResponse;
  }

  if (!backendAccessToken) {
    throw new Error('로그인이 필요해요.');
  }

  const response = await apiDelete<DeleteMyAccountResponse>(
    '/me/account',
    {
      accessToken: backendAccessToken,
      fallbackMessage: '회원 탈퇴 처리에 실패했어요.',
    },
  );

  backendAccessToken = null;
  backendProfile = null;
  await persistSession();
  return response;
}
