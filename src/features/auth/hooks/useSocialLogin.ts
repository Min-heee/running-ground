import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { needsProfileCompletion } from '@/features/auth/utils/profileCompletion';
import { getApiErrorMessage } from '@/services/apiError';
import { signInWithProvider } from '@/services/authService';

export type SocialProvider = 'google' | 'kakao' | 'naver' | 'apple';

// Shared state for the social-login buttons on both the login and signup screens:
// tracks which provider is mid-flow (for the spinner) and surfaces a single error line.
export function useSocialLogin() {
  const [busyProvider, setBusyProvider] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSocialLogin = useCallback(
    async (provider: SocialProvider) => {
      if (busyProvider) {
        return;
      }

      setError(null);
      setBusyProvider(provider);

      try {
        const result = await signInWithProvider(provider);

        if (!result) {
          // User dismissed the in-app browser — stay on the screen, no error.
          return;
        }

        // 소셜 계정은 가입 폼을 건너뛰므로 지역이 비어 있으면 (신규는 항상,
        // 기존 계정도 미설정이면) 기본 정보 설정을 먼저 거친다. 그다음 신규는
        // 온보딩 투어(welcome), 기존 유저는 홈으로.
        if (needsProfileCompletion(result.profile)) {
          router.replace(`/complete-profile?next=${result.isNewUser ? 'welcome' : 'home'}`);
          return;
        }

        router.replace(result.isNewUser ? '/welcome' : '/(tabs)/home');
      } catch (socialError) {
        setError(getApiErrorMessage(socialError, '간편 로그인에 실패했어요.'));
      } finally {
        setBusyProvider(null);
      }
    },
    [busyProvider],
  );

  return { busyProvider, error, handleSocialLogin };
}
