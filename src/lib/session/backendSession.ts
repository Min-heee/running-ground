import type { UserProfile } from '@/domain';
import { apiGet } from '@/services/apiClient';
import type { AuthResponse, MyProfileResponse } from '@/lib/api/types';
import type { BackendSessionState, SessionSnapshot } from '@/lib/session/types';

export function createBackendSession(authResponse: AuthResponse): BackendSessionState {
  return {
    accessToken: authResponse.accessToken,
    profile: authResponse.user,
  };
}

export async function fetchBackendProfile(accessToken: string) {
  return apiGet<MyProfileResponse>('/me/profile', {
    accessToken,
    fallbackMessage: '세션 확인에 실패했어요.',
  });
}

export function buildBackendSessionSnapshot({
  accessToken,
  profile,
}: {
  accessToken: string | null;
  profile: UserProfile | null;
}) {
  if (!accessToken || !profile) {
    return null;
  }

  return {
    mode: 'backend',
    signedIn: true,
    accessToken,
    profile,
  } satisfies SessionSnapshot;
}
