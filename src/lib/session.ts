import * as SecureStore from 'expo-secure-store';
import { myProfile } from '@/data/mock';
import { UserProfile } from '@/domain/types';
import { apiGet, apiPost } from '@/lib/api/client';
import { USE_MOCK_API } from '@/lib/api/config';
import { AuthResponse, LogoutResponse, MyProfileResponse, UsernameAvailabilityResponse } from '@/lib/api/types';

const SESSION_STORAGE_KEY = 'runnigapp.session.v1';
export const USERNAME_RULE_DESCRIPTION = '아이디는 4~20자의 영문 소문자, 숫자, -, _만 사용할 수 있어요.';
export const PASSWORD_RULE_DESCRIPTION = '비밀번호는 8자 이상이고 영문과 숫자를 모두 포함해야 해요.';
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{3,19}$/;

type SignInInput = {
  username: string;
  password: string;
};

type RegisterAccountInput = {
  username: string;
  password: string;
  nickname: string;
  realName: string;
  phone: string;
  provinceName: string;
  cityName?: string;
  districtName: string;
  universityName?: string;
  addressDetail: string;
  birthDate: string;
};

type SessionSnapshot = {
  mode: 'mock' | 'backend';
  signedIn: boolean;
  accessToken?: string | null;
  profile?: UserProfile | null;
};

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

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function getUsernameValidationError(value: string) {
  const username = normalizeUsername(value);

  if (!username) {
    return '아이디를 입력해주세요.';
  }

  if (!USERNAME_PATTERN.test(username)) {
    return USERNAME_RULE_DESCRIPTION;
  }

  return null;
}

export function getPasswordValidationError(value: string) {
  if (!value) {
    return '비밀번호를 입력해주세요.';
  }

  if (value.length < 8) {
    return '비밀번호는 8자 이상으로 입력해주세요.';
  }

  if (/\s/.test(value)) {
    return '비밀번호에는 공백을 넣을 수 없어요.';
  }

  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return '비밀번호에는 영문과 숫자를 모두 포함해주세요.';
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isUserProfile(value: unknown): value is UserProfile {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.name === 'string'
    && (value.provinceName === undefined || typeof value.provinceName === 'string')
    && (value.cityName === undefined || typeof value.cityName === 'string')
    && typeof value.districtName === 'string'
    && (value.universityName === undefined || typeof value.universityName === 'string')
    && (value.addressDetail === undefined || typeof value.addressDetail === 'string')
    && typeof value.publicTag === 'string'
    && (value.lifetimeDistanceKm === undefined || typeof value.lifetimeDistanceKm === 'number');
}

async function getStoredSessionValue() {
  if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage) {
    return window.localStorage.getItem(SESSION_STORAGE_KEY);
  }

  try {
    const isSecureStoreAvailable = await SecureStore.isAvailableAsync();
    return isSecureStoreAvailable ? await SecureStore.getItemAsync(SESSION_STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

async function setStoredSessionValue(value: string) {
  if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, value);
    return;
  }

  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.setItemAsync(SESSION_STORAGE_KEY, value);
    }
  } catch {
    // Ignore persistence failures and continue with in-memory session state.
  }
}

async function clearStoredSessionValue() {
  if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }

  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore persistence failures and continue with in-memory session state.
  }
}

function readStoredSession(rawValue: string | null) {
  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as SessionSnapshot;

    if (!parsedValue || typeof parsedValue !== 'object') {
      return null;
    }

    if (parsedValue.mode !== 'mock' && parsedValue.mode !== 'backend') {
      return null;
    }

    if (typeof parsedValue.signedIn !== 'boolean') {
      return null;
    }

    return {
      ...parsedValue,
      accessToken: typeof parsedValue.accessToken === 'string' ? parsedValue.accessToken : null,
      profile: isUserProfile(parsedValue.profile) ? parsedValue.profile : null,
    } satisfies SessionSnapshot;
  } catch {
    return null;
  }
}

async function fetchBackendProfile(accessToken: string) {
  return apiGet<MyProfileResponse>('/me/profile', {
    accessToken,
    fallbackMessage: '세션 확인에 실패했어요.',
  });
}

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

  const snapshot: SessionSnapshot = {
    mode: 'backend',
    signedIn: true,
    accessToken: backendAccessToken,
    profile: backendProfile,
  };
  await setStoredSessionValue(JSON.stringify(snapshot));
}

function setBackendSession(authResponse: AuthResponse) {
  backendAccessToken = authResponse.accessToken;
  backendProfile = authResponse.user;
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

export async function registerAccount({
  username,
  password,
  nickname,
  realName,
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
  const normalizedUsername = normalizeUsername(username);
  const normalizedPhone = phone.replace(/\D/g, '');
  const normalizedProvinceName = provinceName.trim();
  const normalizedCityName = cityName?.trim() ?? '';
  const normalizedDistrictName = districtName.trim();
  const normalizedUniversityName = universityName?.trim() ?? '';
  const normalizedAddressDetail = addressDetail.trim();
  const normalizedBirthDate = birthDate.trim();

  if (!normalizedNickname) {
    throw new Error('닉네임을 입력해주세요.');
  }

  if (!normalizedRealName) {
    throw new Error('이름을 입력해주세요.');
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
      name: normalizedNickname,
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
      nickname: normalizedNickname,
      name: normalizedNickname,
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
