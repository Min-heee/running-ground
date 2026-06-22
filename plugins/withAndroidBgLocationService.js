const { withAndroidManifest } = require('expo/config-plugins');

const PLUGIN_NAME = 'with-runningground-android-bg-location-service';

const FOREGROUND_SERVICE_LOCATION_PERMISSION = 'android.permission.FOREGROUND_SERVICE_LOCATION';
const FOREGROUND_SERVICE_TYPE_ATTRIBUTE = 'android:foregroundServiceType';
const SERVICE_NAME_ATTRIBUTE = 'android:name';
const LOCATION_TYPE = 'location';

// Heuristics for "this <service> is the expo-location background/foreground-location task service".
// expo-location's generated service class names vary across versions (e.g. ...LocationTaskService,
// ...location.services... etc.), so match defensively on substrings rather than an exact FQN. We
// deliberately DO NOT match our own MatchUploadForegroundService here — that service already
// declares its own foregroundServiceType in the module manifest; this plugin only hardens the
// expo-location service so its FOREGROUND_SERVICE_LOCATION type is present on Android 14+.
const LOCATION_SERVICE_NAME_HINTS = ['locationtask', 'location'];

// Merge `location` into an existing pipe-delimited android:foregroundServiceType value WITHOUT
// clobbering any types the service already declares.
function mergeForegroundServiceType(existingValue) {
  const existingTypes = (existingValue ?? '')
    .split('|')
    .map((type) => type.trim())
    .filter(Boolean);

  if (existingTypes.includes(LOCATION_TYPE)) {
    return existingTypes.join('|');
  }

  return [...existingTypes, LOCATION_TYPE].join('|');
}

function looksLikeExpoLocationService(serviceNode) {
  const serviceName = serviceNode?.$?.[SERVICE_NAME_ATTRIBUTE];

  if (typeof serviceName !== 'string') {
    return false;
  }

  const normalizedName = serviceName.toLowerCase();

  // Never harden our own match-upload foreground service via this plugin — it owns its type in the
  // module manifest. Only target the expo-location-generated service.
  if (normalizedName.includes('matchupload')) {
    return false;
  }

  return LOCATION_SERVICE_NAME_HINTS.some((hint) => normalizedName.includes(hint));
}

function ensureForegroundServiceLocationPermission(manifest) {
  const usesPermissions = Array.isArray(manifest['uses-permission'])
    ? manifest['uses-permission']
    : manifest['uses-permission']
      ? [manifest['uses-permission']]
      : [];

  const alreadyDeclared = usesPermissions.some(
    (entry) => entry?.$?.[SERVICE_NAME_ATTRIBUTE] === FOREGROUND_SERVICE_LOCATION_PERMISSION,
  );

  if (!alreadyDeclared) {
    usesPermissions.push({
      $: { [SERVICE_NAME_ATTRIBUTE]: FOREGROUND_SERVICE_LOCATION_PERMISSION },
    });
  }

  manifest['uses-permission'] = usesPermissions;
}

function hardenExpoLocationService(manifest) {
  const applications = Array.isArray(manifest.application)
    ? manifest.application
    : manifest.application
      ? [manifest.application]
      : [];

  for (const application of applications) {
    const services = Array.isArray(application?.service)
      ? application.service
      : application?.service
        ? [application.service]
        : [];

    for (const serviceNode of services) {
      if (!looksLikeExpoLocationService(serviceNode)) {
        continue;
      }

      if (!serviceNode.$) {
        serviceNode.$ = {};
      }

      // Merge (don't clobber) so a service that already declares another foregroundServiceType
      // keeps it and simply gains `location`.
      serviceNode.$[FOREGROUND_SERVICE_TYPE_ATTRIBUTE] = mergeForegroundServiceType(
        serviceNode.$[FOREGROUND_SERVICE_TYPE_ATTRIBUTE],
      );
    }
  }
}

// Ensure the expo-location-generated foreground location Service declares
// android:foregroundServiceType="location" and that FOREGROUND_SERVICE_LOCATION is present, which
// Android 14+ requires for a background-location foreground service to start. Be DEFENSIVE: if the
// manifest shape is unexpected or no matching service is found, NO-OP — never throw, because a
// thrown config plugin breaks `expo prebuild` and fails the EAS build.
function withAndroidBgLocationService(config) {
  return withAndroidManifest(config, (nextConfig) => {
    try {
      const manifest = nextConfig?.modResults?.manifest;

      if (!manifest) {
        return nextConfig;
      }

      ensureForegroundServiceLocationPermission(manifest);
      hardenExpoLocationService(manifest);
    } catch {
      // Defensive: a malformed manifest or unexpected node shape must never break prebuild/EAS.
      // Worst case the manifest is left untouched and expo-location's own defaults apply.
    }

    return nextConfig;
  });
}

withAndroidBgLocationService.pluginName = PLUGIN_NAME;

module.exports = withAndroidBgLocationService;
