import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getCurrentUserProfile } from '@/lib/session';
import { API_CONFIG, USE_MOCK_API } from '@/services/apiClient';
import { isRgPerfTraceEnabled } from '@/utils/rgPerfTrace';
import type { UserProfile } from '@/domain';

declare const __DEV__: boolean | undefined;

export type RgEnvironmentInfo = {
  apiBaseUrl: string;
  appIdentifier: string;
  appVariant: string;
  buildMode: 'dev' | 'release';
  mockApi: string;
  platform: string;
  userId: string;
  userNickname: string;
};

type ExpoConfigWithIdentifiers = {
  android?: {
    package?: string;
  };
  extra?: {
    appVariant?: string;
  };
  ios?: {
    bundleIdentifier?: string;
  };
};

function getExpoConfig() {
  return Constants.expoConfig as ExpoConfigWithIdentifiers | null;
}

function getAppIdentifier() {
  const expoConfig = getExpoConfig();
  const constantsWithApplicationId = Constants as typeof Constants & {
    applicationId?: string | null;
  };

  return constantsWithApplicationId.applicationId ?? Platform.select({
    android: expoConfig?.android?.package ?? null,
    ios: expoConfig?.ios?.bundleIdentifier ?? null,
    default: expoConfig?.ios?.bundleIdentifier ?? expoConfig?.android?.package ?? null,
  }) ?? 'unknown';
}

function getExpoPublicEnvValue(key: 'EXPO_PUBLIC_API_BASE_URL' | 'EXPO_PUBLIC_USE_MOCK_API') {
  const maybeProcess = globalThis as unknown as {
    process?: {
      env?: Record<string, string | undefined>;
    };
  };

  return maybeProcess.process?.env?.[key] ?? null;
}

export function getRgEnvironmentInfo(profile: UserProfile | null = getCurrentUserProfile()): RgEnvironmentInfo {
  const expoConfig = getExpoConfig();

  return {
    apiBaseUrl: getExpoPublicEnvValue('EXPO_PUBLIC_API_BASE_URL') ?? API_CONFIG.baseUrl,
    appIdentifier: getAppIdentifier(),
    appVariant: expoConfig?.extra?.appVariant ?? 'unknown',
    buildMode: typeof __DEV__ !== 'undefined' && __DEV__ ? 'dev' : 'release',
    mockApi: getExpoPublicEnvValue('EXPO_PUBLIC_USE_MOCK_API') ?? String(USE_MOCK_API),
    platform: Platform.OS,
    userId: profile?.publicTag ?? 'unknown',
    userNickname: profile?.name ?? 'unknown',
  };
}

export function shouldShowRgEnvironmentDebugByDefault() {
  const info = getRgEnvironmentInfo();

  return info.buildMode === 'dev'
    || info.appVariant === 'development'
    || info.appVariant === 'preview'
    || isRgPerfTraceEnabled();
}

export function logRgEnvironmentOnce() {
  if (!isRgPerfTraceEnabled()) {
    return;
  }

  // Dev-only environment trace. Keep this gated so preview/production builds stay quiet by default.
  globalThis['console'].log('[RG env]', getRgEnvironmentInfo());
}
