// Android-only Health Connect access plugin.
//
// The iOS Apple-Health half (entitlement, health usage-description Info.plist
// keys, the native reader module, and the framework link) was removed for the
// App Store 2.5.1 resolution — the reviewer's static check must find ZERO
// health-framework references in the binary. The removed iOS pieces live in
// git history for the planned post-launch re-add.
const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withStringsXml,
} = require('expo/config-plugins');

const PLUGIN_NAME = 'with-runningground-health-access';
const PLUGIN_VERSION = '1.0.0';
const HEALTH_CONNECT_PACKAGE = 'com.google.android.apps.healthdata';
const HEALTH_CONNECT_PERMISSIONS = [
  'android.permission.health.READ_EXERCISE',
  'android.permission.health.READ_DISTANCE',
];

// Health Connect permission-rationale wiring. Android requires the app's launcher activity to
// answer the rationale intents before it will show the permission sheet:
//   - ACTION_SHOW_PERMISSIONS_RATIONALE: Android 13 and below.
//   - VIEW_PERMISSION_USAGE + HEALTH_PERMISSIONS category: Android 14+.
const RATIONALE_ACTION_SHOW = 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE';
const RATIONALE_ACTION_VIEW = 'android.intent.action.VIEW_PERMISSION_USAGE';
const RATIONALE_CATEGORY = 'android.intent.category.HEALTH_PERMISSIONS';
const RATIONALE_ALIAS_NAME = 'ViewPermissionUsageActivity';
const RATIONALE_PROPERTY_NAME = 'android.health.PERMISSIONS_RATIONALE';
const RATIONALE_STRING_NAME = 'health_permissions_rationale_url';
// A public privacy-policy URL is required by Health Connect on Android 14+. Served by the
// production backend (backend/src/routes/legalRoutes.mjs) on the live api subdomain — the
// apex domain has no DNS record. Baked into the manifest at the next native build.
const RATIONALE_PRIVACY_POLICY_URL = 'https://api.running-ground.com/privacy';

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

function ensureRationaleActivityAlias(androidManifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);

  if (!Array.isArray(application['activity-alias'])) {
    application['activity-alias'] = [];
  }

  if (application['activity-alias'].some((alias) => alias.$?.['android:name'] === RATIONALE_ALIAS_NAME)) {
    return;
  }

  // Activity-alias on the launcher activity that answers the Health Connect rationale intents.
  application['activity-alias'].push({
    $: {
      'android:name': RATIONALE_ALIAS_NAME,
      'android:exported': 'true',
      'android:targetActivity': '.MainActivity',
      'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
    },
    'intent-filter': [
      {
        action: [{ $: { 'android:name': RATIONALE_ACTION_SHOW } }],
      },
      {
        action: [{ $: { 'android:name': RATIONALE_ACTION_VIEW } }],
        category: [{ $: { 'android:name': RATIONALE_CATEGORY } }],
      },
    ],
  });
}

function ensureRationaleProperty(androidManifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);

  if (!Array.isArray(application.property)) {
    application.property = [];
  }

  if (application.property.some((entry) => entry.$?.['android:name'] === RATIONALE_PROPERTY_NAME)) {
    return;
  }

  application.property.push({
    $: {
      'android:name': RATIONALE_PROPERTY_NAME,
      'android:resource': `@string/${RATIONALE_STRING_NAME}`,
    },
  });
}

function withAndroidHealthAccess(config) {
  return withAndroidManifest(config, (nextConfig) => {
    const manifest = nextConfig.modResults.manifest;

    for (const permission of HEALTH_CONNECT_PERMISSIONS) {
      ensureUsesPermission(manifest, permission);
    }

    ensureHealthConnectQueries(manifest);
    // The rationale helpers resolve the main <application> via AndroidConfig, which expects the
    // full androidManifest wrapper (nextConfig.modResults), not the inner manifest node.
    ensureRationaleActivityAlias(nextConfig.modResults);
    ensureRationaleProperty(nextConfig.modResults);
    return nextConfig;
  });
}

function withAndroidHealthRationaleString(config) {
  return withStringsXml(config, (nextConfig) => {
    nextConfig.modResults = AndroidConfig.Strings.setStringItem(
      [
        {
          $: { name: RATIONALE_STRING_NAME, translatable: 'false' },
          _: RATIONALE_PRIVACY_POLICY_URL,
        },
      ],
      nextConfig.modResults,
    );
    return nextConfig;
  });
}

function withHealthAccess(config) {
  config = withAndroidHealthAccess(config);
  config = withAndroidHealthRationaleString(config);
  return config;
}

module.exports = createRunOncePlugin(withHealthAccess, PLUGIN_NAME, PLUGIN_VERSION);
