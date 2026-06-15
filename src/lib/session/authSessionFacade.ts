import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type {
  AuthResponse,
  DeleteMyAccountResponse,
  LogoutResponse,
} from '@/lib/api/types';
import type { SignInInput } from '@/lib/session/types';
import { normalizeUsername } from '@/lib/session/validation';
import { API_CONFIG, apiDelete, apiPost, USE_MOCK_API } from '@/services/apiClient';
import { fetchBackendProfile } from './backendSession';
import {
  applyBackendAuthSession,
  applyMockSignIn,
  clearSession,
  ensureHydrated,
  getBackendAccessToken,
} from './sessionState';

// The app reopens through this custom scheme once the backend finishes the OAuth
// dance: runningground://oauth?token=<accessToken>  (or ?error=<code> on failure).
const SOCIAL_APP_REDIRECT = 'runningground://oauth';

const SOCIAL_ERROR_MESSAGES: Record<string, string> = {
  not_configured: '이 간편 로그인은 아직 사용할 수 없어요.',
  no_code: '간편 로그인이 완료되지 않았어요. 다시 시도해주세요.',
  access_denied: '간편 로그인을 취소했어요.',
  auth_failed: '간편 로그인에 실패했어요. 다시 시도해주세요.',
};

function resolveSocialError(code: string | null) {
  return (code ? SOCIAL_ERROR_MESSAGES[code] : null) ?? '간편 로그인에 실패했어요. 다시 시도해주세요.';
}

export async function signIn(input?: SignInInput) {
  await ensureHydrated();

  if (USE_MOCK_API) {
    return applyMockSignIn();
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

  return applyBackendAuthSession(authResponse);
}

// Opens the backend-driven OAuth flow in an in-app browser. The backend handles the
// provider redirect + code exchange (client secret stays server-side) and sends us back
// a session token via the runningground:// scheme, which openAuthSessionAsync captures.
// Returns the signed-in profile, or null when the user dismisses the browser (silent cancel).
export async function signInWithProvider(provider: 'kakao' | 'google' | 'apple' | 'naver') {
  await ensureHydrated();

  if (USE_MOCK_API) {
    return applyMockSignIn();
  }

  if (provider === 'apple') {
    throw new Error('애플 간편 로그인은 아직 준비 중이에요.');
  }

  const startUrl = `${API_CONFIG.baseUrl}/auth/${provider}/start?app_redirect=${encodeURIComponent(SOCIAL_APP_REDIRECT)}`;
  const result = await WebBrowser.openAuthSessionAsync(startUrl, SOCIAL_APP_REDIRECT);

  if (result.type !== 'success' || !result.url) {
    // 'cancel' / 'dismiss' → user closed the browser without finishing. Stay quiet.
    return null;
  }

  const { queryParams } = Linking.parse(result.url);
  const token = typeof queryParams?.token === 'string' ? queryParams.token : null;
  const errorCode = typeof queryParams?.error === 'string' ? queryParams.error : null;

  if (!token) {
    throw new Error(resolveSocialError(errorCode));
  }

  const profile = await fetchBackendProfile(token);
  return applyBackendAuthSession({ accessToken: token, user: profile });
}

export async function signOut() {
  await ensureHydrated();

  if (USE_MOCK_API) {
    await clearSession();
    return;
  }

  const backendAccessToken = getBackendAccessToken();
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

  await clearSession();
}

export async function deleteAccount() {
  await ensureHydrated();

  if (USE_MOCK_API) {
    await clearSession();
    return {
      success: true,
      deletedUserId: 'mock-user',
    } satisfies DeleteMyAccountResponse;
  }

  const backendAccessToken = getBackendAccessToken();
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

  await clearSession();
  return response;
}
