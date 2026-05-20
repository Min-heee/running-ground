import type {
  AuthResponse,
  DeleteMyAccountResponse,
  LogoutResponse,
} from '@/lib/api/types';
import type { SignInInput } from '@/lib/session/types';
import { normalizeUsername } from '@/lib/session/validation';
import { apiDelete, apiPost, USE_MOCK_API } from '@/services/apiClient';
import {
  applyBackendAuthSession,
  applyMockSignIn,
  clearSession,
  ensureHydrated,
  getBackendAccessToken,
} from './sessionState';

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

export async function signInWithProvider(provider: 'kakao' | 'google' | 'apple' | 'naver') {
  await ensureHydrated();

  if (!USE_MOCK_API) {
    throw new Error(`${provider} 간편 로그인은 아직 준비되지 않았어요. 지금은 계정 로그인으로 진행해주세요.`);
  }

  return applyMockSignIn();
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
