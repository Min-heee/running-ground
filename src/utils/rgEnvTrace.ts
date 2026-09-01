import { Platform } from 'react-native';
import * as Application from 'expo-application';
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

function getNativeApplicationId(): string | null {
  const applicationId = Application.applicationId;
  return typeof applicationId === 'string' && applicationId.trim() ? applicationId : null;
}

function getAppIdentifier() {
  const expoConfig = getExpoConfig();

  // 네이티브 진실(Application.applicationId) 최우선 — expoConfig의 식별자는 OTA 매니페스트
  // 에서 오므로, 발행 환경이 잘못되면 함께 오염된다 (2026-09-01 사고, 아래 주석).
  return getNativeApplicationId() ?? Platform.select({
    android: expoConfig?.android?.package ?? null,
    ios: expoConfig?.ios?.bundleIdentifier ?? null,
    default: expoConfig?.ios?.bundleIdentifier ?? expoConfig?.android?.package ?? null,
  }) ?? 'unknown';
}

// 개발/프리뷰 "빌드" 판별은 번들 ID 접미사로 한다 (app.config.ts buildIdentifier:
// production은 무접미사, 그 외 `.development`/`.preview`). 바이너리에 구워진 네이티브
// 값이라 OTA 매니페스트가 뭐라고 주장하든 오염되지 않는다.
//
// 매니페스트의 appVariant를 게이트에 쓰면 안 되는 이유 (2026-09-01 사고): eas update가
// 발행 시점 환경으로 app.config.ts를 평가해 extra.appVariant를 매니페스트에 싣는데,
// 발행 환경에 APP_VARIANT가 빠지면 기본값 'development'가 박힌다 → 프로덕션 전 사용자에게
// 개발자 환경 카드가 기본 노출되고 /admin 클라 라우트 게이트까지 열렸다. 발행 환경도
// 고쳤지만(EAS env APP_VARIANT=production), 게이트는 다시는 매니페스트를 믿지 않는다.
function isVariantSuffixedBinary() {
  const nativeId = getNativeApplicationId();
  return nativeId !== null
    && (nativeId.endsWith('.development') || nativeId.endsWith('.preview'));
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

  // 스토어(무접미사) 바이너리에서는 절대 기본 노출하지 않는다 — 프로덕션 진단은 마이
  // 탭의 5탭 언락이 담당. 접미사 빌드(개발/프리뷰 클라이언트)만 기본 노출.
  return info.buildMode === 'dev'
    || isVariantSuffixedBinary()
    || isRgPerfTraceEnabled();
}

export function isAdminRouteEnabled() {
  // Store-review surface reduction: the /admin deep-link route only exists in dev builds and
  // variant-suffixed (development/preview) binaries. Production treats it as an unknown route.
  // Server-side data is already protected by requireAdmin — this only hides the client UI.
  const buildMode = typeof __DEV__ !== 'undefined' && __DEV__ ? 'dev' : 'release';
  return buildMode === 'dev' || isVariantSuffixedBinary();
}

export function logRgEnvironmentOnce() {
  if (!isRgPerfTraceEnabled()) {
    return;
  }

  // Dev-only environment trace. Keep this gated so preview/production builds stay quiet by default.
  globalThis['console'].log('[RG env]', getRgEnvironmentInfo());
}
