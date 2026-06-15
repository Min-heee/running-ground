import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { getApiErrorMessage } from '@/services/apiError';
import { signInWithProvider } from '@/services/authService';

export type SocialProvider = 'google' | 'kakao' | 'naver';

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
        const profile = await signInWithProvider(provider);

        if (!profile) {
          // User dismissed the in-app browser — stay on the screen, no error.
          return;
        }

        router.replace('/(tabs)/home');
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
