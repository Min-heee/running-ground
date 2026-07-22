import { Platform } from 'react-native';

// Sign in with Apple — availability-gated native flow (App Review 4.8).
//
// The expo-apple-authentication native module ships from build 51; on older
// binaries the dynamic import (or isAvailableAsync) fails and every caller
// degrades gracefully: the Apple button simply never renders. Same OTA-safety
// pattern as the Apple Health module gate.

type AppleAuthModule = typeof import('expo-apple-authentication');

async function getAppleAuthModule(): Promise<AppleAuthModule | null> {
  if (Platform.OS !== 'ios') {
    return null;
  }

  try {
    return await import('expo-apple-authentication');
  } catch {
    return null;
  }
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  const module = await getAppleAuthModule();

  if (!module?.isAvailableAsync) {
    return false;
  }

  try {
    return await module.isAvailableAsync();
  } catch {
    return false;
  }
}

export type AppleSignInResult = {
  identityToken: string;
  // Full name — Apple provides it ONLY on the first authorization; empty after.
  name: string;
};

// Present the native Apple sheet. Returns null when the user cancels.
export async function signInWithAppleNative(): Promise<AppleSignInResult | null> {
  const module = await getAppleAuthModule();

  if (!module?.signInAsync) {
    throw new Error('이 앱 버전에서는 애플 로그인을 사용할 수 없어요. 앱을 업데이트해주세요.');
  }

  try {
    const credential = await module.signInAsync({
      requestedScopes: [
        module.AppleAuthenticationScope.FULL_NAME,
        module.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      throw new Error('애플 로그인 정보를 받지 못했어요. 다시 시도해주세요.');
    }

    // Korean name order: family name then given name, no space.
    const name = [credential.fullName?.familyName, credential.fullName?.givenName]
      .filter(Boolean)
      .join('');

    return { identityToken: credential.identityToken, name };
  } catch (error) {
    if ((error as { code?: string })?.code === 'ERR_REQUEST_CANCELED') {
      return null;
    }

    throw error;
  }
}
