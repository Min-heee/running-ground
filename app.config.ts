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
  const runtimeVersion = process.env.EXPO_RUNTIME_VERSION?.trim() || version;
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
    NSMotionUsageDescription:
      (baseConfig.ios?.infoPlist as Record<string, string | undefined> | undefined)?.NSMotionUsageDescription
      || 'Allow RunningGround to read your motion data so cadence can be shown while you run.',
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
              'Allow RunningGround to use your location so your run route, distance, pace, and elevation can be tracked live.',
            locationAlwaysAndWhenInUsePermission:
              'Allow RunningGround to keep tracking your running route, distance, and pace even when the app is in the background.',
            isIosBackgroundLocationEnabled: true,
            isAndroidBackgroundLocationEnabled: true,
            isAndroidForegroundServiceEnabled: true,
          },
        ],
        [
          'expo-sensors',
          {
            motionPermission:
              'Allow RunningGround to read your motion data so cadence can be shown while you run.',
          },
        ],
        './plugins/withHealthAccess',
        './plugins/withAndroidBgLocationService',
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
