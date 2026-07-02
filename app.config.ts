import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

const appJson = require('./app.json');
const packageJson = require('./package.json');
const {
  DEFAULT_EAS_PROJECT_ID,
  formatReleaseValidationReport,
  normalizeAppVariant,
  validateReleaseEnvironment,
} = require('./release-environment.cjs');
const DEFAULT_EAS_UPDATE_URL = `https://u.expo.dev/${DEFAULT_EAS_PROJECT_ID}`;

// ─────────────────────────────────────────────────────────────────────────────
// RUNTIME VERSION INVARIANT — READ BEFORE CHANGING.
//
// This is the OTA compatibility contract, NOT the marketing version. Every
// production install in the field currently runs runtime '0.1.0'; eas update
// only delivers bundles whose runtimeVersion matches the installed binary's.
//
//  * The runtime version changes ONLY when native code changes (new native
//    module, native config/plugin change, SDK upgrade) — NEVER with marketing
//    version bumps (package.json "version" / APP_VERSION / store version).
//  * If this were derived from package.json version (the old behavior), a
//    store version bump would silently orphan every installed device: OTAs
//    would publish to a runtime nobody runs, and installed apps would stop
//    receiving updates without any error.
//  * When the runtime DOES change (native release), dual-publish OTAs to the
//    old runtime's branch for N weeks so not-yet-updated installs keep
//    receiving fixes. See docs/release-runbook.md.
// ─────────────────────────────────────────────────────────────────────────────
const RUNTIME_VERSION = '0.1.0';

type AppVariant = 'development' | 'preview' | 'production';

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function readPositiveInteger(value: string | undefined, fallbackValue: number) {
  const parsedValue = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallbackValue;
}

function buildAppName(baseName: string, variant: AppVariant) {
  if (variant === 'preview') {
    return `${baseName} Preview`;
  }

  if (variant === 'development') {
    return `${baseName} Dev`;
  }

  return baseName;
}

function buildIdentifier(baseIdentifier: string | undefined, variant: AppVariant) {
  const safeBaseIdentifier = baseIdentifier?.trim() || 'com.anonymous.runningground';

  if (variant === 'production') {
    return safeBaseIdentifier;
  }

  return `${safeBaseIdentifier}.${variant}`;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  loadEnvFile(resolve(process.cwd(), '.env'));
  const baseConfig = (appJson.expo ?? config) as ExpoConfig;
  const appVariant = normalizeAppVariant(process.env.APP_VARIANT) as AppVariant;
  const isDevelopmentVariant = appVariant === 'development';
  const version = process.env.APP_VERSION?.trim() || packageJson.version || '0.1.0';
  // Pinned: NEVER fall back to `version` here — see RUNTIME_VERSION invariant above.
  const runtimeVersion = process.env.EXPO_RUNTIME_VERSION?.trim() || RUNTIME_VERSION;
  const baseDisplayName = baseConfig.name || 'RunningGround';
  const baseBundleIdentifier = baseConfig.ios?.bundleIdentifier;
  const iosApplicationQueriesSchemes = Array.from(
    new Set([
      ...((baseConfig.ios?.infoPlist as Record<string, string[] | undefined> | undefined)?.LSApplicationQueriesSchemes ?? []),
      'kakaomap',
      'nmap',
    ]),
  );
  const iosInfoPlist = {
    ...(baseConfig.ios?.infoPlist ?? {}),
    ITSAppUsesNonExemptEncryption: false,
    LSApplicationQueriesSchemes: iosApplicationQueriesSchemes,
    // Enables the iOS Live Activity (lock-screen live-run card + Dynamic Island). Required on the
    // MAIN APP target for ActivityKit to allow Activity.request(...). The widget extension that
    // renders the card is the @bacons/apple-targets target under targets/live-activity/ (gated to
    // iOS 16.2+; on older OSes the bridge no-ops and the app is unaffected).
    NSSupportsLiveActivities: true,
    NSMotionUsageDescription:
      (baseConfig.ios?.infoPlist as Record<string, string | undefined> | undefined)?.NSMotionUsageDescription
      || '러닝 중 케이던스(분당 걸음 수)를 표시하기 위해 동작·피트니스 데이터 접근 권한이 필요해요.',
    ...(isDevelopmentVariant
      ? {
          NSLocalNetworkUsageDescription:
            'Allow RunningGround to connect to your local development servers on the same network.',
          NSAppTransportSecurity: {
            NSAllowsArbitraryLoads: true,
          },
        }
      : {}),
  };

  if (!isDevelopmentVariant) {
    delete iosInfoPlist.NSLocalNetworkUsageDescription;
    delete iosInfoPlist.NSAppTransportSecurity;
  }

  const easProjectId = process.env.EAS_PROJECT_ID?.trim() || DEFAULT_EAS_PROJECT_ID;
  const iosBundleIdentifier = process.env.IOS_BUNDLE_ID?.trim()
    || buildIdentifier(baseBundleIdentifier, appVariant);
  const androidPackage = process.env.ANDROID_PACKAGE?.trim()
    || buildIdentifier(baseBundleIdentifier, appVariant);
  const releaseValidation = validateReleaseEnvironment(
    {
      ...process.env,
      APP_VARIANT: appVariant,
      EAS_PROJECT_ID: easProjectId,
      IOS_BUNDLE_ID: iosBundleIdentifier,
      ANDROID_PACKAGE: androidPackage,
    },
    {
      defaultEasProjectId: DEFAULT_EAS_PROJECT_ID,
      defaultIosBundleId: baseBundleIdentifier,
      defaultAndroidPackage: baseBundleIdentifier,
    },
  );

  if (!releaseValidation.ok && appVariant !== 'development') {
    throw new Error(formatReleaseValidationReport(releaseValidation));
  }

  if (releaseValidation.warnings.length > 0) {
    console.warn(formatReleaseValidationReport(releaseValidation));
  }

  return {
    ...baseConfig,
    name: buildAppName(baseDisplayName, appVariant),
    slug: baseConfig.slug ?? 'runningground',
    scheme: baseConfig.scheme ?? 'runningground',
    version,
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    runtimeVersion,
    updates: {
      ...(baseConfig.updates ?? {}),
      url: process.env.EXPO_UPDATES_URL?.trim() || DEFAULT_EAS_UPDATE_URL,
      fallbackToCacheTimeout: 0,
    },
    plugins: Array.from(
      new Set([
        ...(baseConfig.plugins ?? []),
        'expo-router',
        'expo-web-browser',
        ...(isDevelopmentVariant ? ['expo-dev-client'] : []),
        [
          'expo-location',
          {
            locationWhenInUsePermission:
              '러닝 중 경로·거리·페이스·고도를 실시간으로 측정하기 위해 위치 권한이 필요해요.',
            locationAlwaysAndWhenInUsePermission:
              '화면을 꺼도 러닝 경로·거리·페이스 측정이 끊기지 않도록, 백그라운드에서도 위치 권한이 필요해요.',
            isIosBackgroundLocationEnabled: true,
            isAndroidBackgroundLocationEnabled: true,
            isAndroidForegroundServiceEnabled: true,
          },
        ],
        [
          'expo-sensors',
          {
            motionPermission:
              '러닝 중 케이던스(분당 걸음 수)를 표시하기 위해 동작·피트니스 데이터 접근 권한이 필요해요.',
          },
        ],
        './plugins/withHealthAccess',
        './plugins/withAndroidBgLocationService',
        // Generates + signs the iOS Live Activity widget-extension target from targets/live-activity/
        // (expo-target.config.js). No-op for Android. Must run during prebuild so the widget target,
        // its 16.2 deployment target, and the shared RunActivityAttributes are wired into the
        // generated Xcode project.
        '@bacons/apple-targets',
      ]),
    ),
    ios: {
      ...baseConfig.ios,
      bundleIdentifier: iosBundleIdentifier,
      buildNumber: process.env.IOS_BUILD_NUMBER?.trim() || baseConfig.ios?.buildNumber || '1',
      supportsTablet: true,
      infoPlist: iosInfoPlist,
    },
    android: {
      ...baseConfig.android,
      package: androidPackage,
      versionCode: readPositiveInteger(process.env.ANDROID_VERSION_CODE, baseConfig.android?.versionCode ?? 1),
      edgeToEdgeEnabled: true,
    },
    extra: {
      ...(baseConfig.extra ?? {}),
      appVariant,
      ...(easProjectId
        ? {
            eas: {
              projectId: easProjectId,
            },
          }
        : {}),
    },
    experiments: {
      ...(baseConfig.experiments ?? {}),
      typedRoutes: true,
    },
  };
};
