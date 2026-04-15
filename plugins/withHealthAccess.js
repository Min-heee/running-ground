const {
  createRunOncePlugin,
  withAndroidManifest,
  withEntitlementsPlist,
  withInfoPlist,
} = require('expo/config-plugins');

const PLUGIN_NAME = 'with-runnigapp-health-access';
const PLUGIN_VERSION = '1.0.0';
const HEALTH_CONNECT_PACKAGE = 'com.google.android.apps.healthdata';
const HEALTH_CONNECT_PERMISSIONS = [
  'android.permission.health.READ_EXERCISE',
  'android.permission.health.READ_DISTANCE',
  'android.permission.health.READ_STEPS',
];

function withIosHealthInfoPlist(config) {
  return withInfoPlist(config, (nextConfig) => {
    nextConfig.modResults.NSHealthShareUsageDescription =
      nextConfig.modResults.NSHealthShareUsageDescription
      || 'Allow RUNNIGAPP to read your Apple Health running records so they can appear in your activity and rankings.';

    return nextConfig;
  });
}

function withIosHealthEntitlements(config) {
  return withEntitlementsPlist(config, (nextConfig) => {
    nextConfig.modResults['com.apple.developer.healthkit'] = true;
    return nextConfig;
  });
}

function ensureUsesPermission(manifest, permissionName) {
  const usesPermissions = manifest['uses-permission'] ?? [];

  if (!usesPermissions.some((entry) => entry.$['android:name'] === permissionName)) {
    usesPermissions.push({
      $: {
        'android:name': permissionName,
      },
    });
  }

  manifest['uses-permission'] = usesPermissions;
}

function ensureHealthConnectQueries(manifest) {
  const queries = Array.isArray(manifest.queries) ? manifest.queries : manifest.queries ? [manifest.queries] : [];
  const packageQueries = queries[0] ?? {};
  const packages = Array.isArray(packageQueries.package) ? packageQueries.package : packageQueries.package ? [packageQueries.package] : [];

  if (!packages.some((entry) => entry.$['android:name'] === HEALTH_CONNECT_PACKAGE)) {
    packages.push({
      $: {
        'android:name': HEALTH_CONNECT_PACKAGE,
      },
    });
  }

  packageQueries.package = packages;
  queries[0] = packageQueries;
  manifest.queries = queries;
}

function withAndroidHealthAccess(config) {
  return withAndroidManifest(config, (nextConfig) => {
    const manifest = nextConfig.modResults.manifest;

    for (const permission of HEALTH_CONNECT_PERMISSIONS) {
      ensureUsesPermission(manifest, permission);
    }

    ensureHealthConnectQueries(manifest);
    return nextConfig;
  });
}

function withHealthAccess(config) {
  config = withIosHealthInfoPlist(config);
  config = withIosHealthEntitlements(config);
  config = withAndroidHealthAccess(config);
  return config;
}

module.exports = createRunOncePlugin(withHealthAccess, PLUGIN_NAME, PLUGIN_VERSION);
