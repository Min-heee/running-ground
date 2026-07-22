import { useCallback, useState } from 'react';
import { router } from 'expo-router';
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

        // New social accounts go through the onboarding tutorial (permission gate);
        // returning users drop straight into the app.
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
