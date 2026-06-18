const {
  AndroidConfig,
  createRunOncePlugin,
  IOSConfig,
  withAndroidManifest,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withStringsXml,
  withXcodeProject,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PLUGIN_NAME = 'with-runningground-health-access';
const PLUGIN_VERSION = '1.0.0';
const HEALTH_CONNECT_PACKAGE = 'com.google.android.apps.healthdata';
const IOS_APPLE_HEALTH_MODULE_FILENAME = 'RunnigappAppleHealth.m';
const HEALTH_CONNECT_PERMISSIONS = [
  'android.permission.health.READ_EXERCISE',
  'android.permission.health.READ_DISTANCE',
  'android.permission.health.READ_STEPS',
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
// A public privacy-policy URL is required by Health Connect on Android 14+. Update this to the
// production policy URL when it changes.
const RATIONALE_PRIVACY_POLICY_URL = 'https://running-ground.com/privacy';

const APPLE_HEALTH_MODULE_SOURCE = `#import <Foundation/Foundation.h>
#import <HealthKit/HealthKit.h>
#import <React/RCTBridgeModule.h>

@interface RunnigappAppleHealth : NSObject <RCTBridgeModule>
@property (nonatomic, strong) HKHealthStore *healthStore;
@property (nonatomic, strong) NSISO8601DateFormatter *isoFormatter;
@end

@implementation RunnigappAppleHealth

RCT_EXPORT_MODULE(RunnigappAppleHealth);

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (instancetype)init
{
  self = [super init];
  if (self) {
    _healthStore = [[HKHealthStore alloc] init];
    _isoFormatter = [[NSISO8601DateFormatter alloc] init];
    _isoFormatter.formatOptions = NSISO8601DateFormatWithInternetDateTime;
  }
  return self;
}

- (NSString *)isoStringFromDate:(NSDate *)date
{
  return [self.isoFormatter stringFromDate:date];
}

- (NSSet<HKObjectType *> *)readTypes
{
  HKObjectType *workoutType = [HKObjectType workoutType];
  HKObjectType *distanceType = [HKObjectType quantityTypeForIdentifier:HKQuantityTypeIdentifierDistanceWalkingRunning];

  if (distanceType) {
    return [NSSet setWithObjects:workoutType, distanceType, nil];
  }

  return [NSSet setWithObject:workoutType];
}

- (NSArray<NSDictionary *> *)normalizeWorkouts:(NSArray<HKSample *> *)samples
{
  NSMutableArray<NSDictionary *> *normalizedRuns = [NSMutableArray array];
  HKUnit *meterUnit = [HKUnit meterUnit];

  for (HKSample *sample in samples) {
    if (![sample isKindOfClass:[HKWorkout class]]) {
      continue;
    }

    HKWorkout *workout = (HKWorkout *)sample;
    HKQuantity *totalDistance = workout.totalDistance;

    if (!totalDistance) {
      continue;
    }

    double distanceKm = [totalDistance doubleValueForUnit:meterUnit] / 1000.0;

    if (!isfinite(distanceKm) || distanceKm <= 0.0) {
      continue;
    }

    NSTimeInterval durationSeconds = workout.duration;
    double paceSecondsPerKm = durationSeconds > 0.0 ? durationSeconds / distanceKm : 0.0;
    NSString *sourceName = workout.sourceRevision.source.name ?: @"";
    NSString *normalizedSourceLabel = sourceName;

    if ([[sourceName lowercaseString] containsString:@"nike"] && [[sourceName lowercaseString] containsString:@"run"]) {
      normalizedSourceLabel = @"NRC";
    }

    NSMutableDictionary *payload = [@{
      @"externalId": workout.UUID.UUIDString ?: @"",
      @"startedAt": [self isoStringFromDate:workout.startDate],
      @"date": [[self isoStringFromDate:workout.startDate] substringToIndex:10],
      @"distanceKm": @(distanceKm),
      @"durationSeconds": @(durationSeconds),
      @"paceSecondsPerKm": @(paceSecondsPerKm),
    } mutableCopy];

    if (normalizedSourceLabel.length > 0) {
      payload[@"sourceLabel"] = normalizedSourceLabel;
    }

    [normalizedRuns addObject:payload];
  }

  return normalizedRuns;
}

RCT_REMAP_METHOD(isAvailable,
                 isAvailableWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve(@([HKHealthStore isHealthDataAvailable]));
}

RCT_REMAP_METHOD(readRuns,
                 readRunsWithInput:(NSDictionary * _Nullable)input
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  if (![HKHealthStore isHealthDataAvailable]) {
    resolve(@[]);
    return;
  }

  NSNumber *limitNumber = [input isKindOfClass:[NSDictionary class]] ? input[@"limit"] : nil;
  NSInteger requestedLimit = [limitNumber respondsToSelector:@selector(integerValue)] ? limitNumber.integerValue : 30;
  NSInteger limit = requestedLimit > 0 ? requestedLimit : 30;
  NSSet<HKObjectType *> *readTypes = [self readTypes];

  [self.healthStore requestAuthorizationToShareTypes:nil
                                           readTypes:readTypes
                                          completion:^(BOOL success, NSError * _Nullable error) {
    if (error) {
      reject(@"apple_health_auth_failed", error.localizedDescription ?: @"Apple Health 권한 요청에 실패했어.", error);
      return;
    }

    NSPredicate *predicate = [HKQuery predicateForWorkoutsWithWorkoutActivityType:HKWorkoutActivityTypeRunning];
    NSSortDescriptor *sortDescriptor = [NSSortDescriptor sortDescriptorWithKey:HKSampleSortIdentifierEndDate ascending:NO];

    HKSampleQuery *query = [[HKSampleQuery alloc] initWithSampleType:[HKObjectType workoutType]
                                                           predicate:predicate
                                                               limit:limit
                                                     sortDescriptors:@[sortDescriptor]
                                                      resultsHandler:^(HKSampleQuery * _Nonnull query, NSArray<HKSample *> * _Nullable results, NSError * _Nullable queryError) {
      if (queryError) {
        reject(@"apple_health_query_failed", queryError.localizedDescription ?: @"Apple Health 기록을 읽지 못했어.", queryError);
        return;
      }

      NSArray<NSDictionary *> *normalizedRuns = [self normalizeWorkouts:results ?: @[]];
      resolve(normalizedRuns);
    }];

    [self.healthStore executeQuery:query];
  }];
}

@end
`;

function withIosHealthInfoPlist(config) {
  return withInfoPlist(config, (nextConfig) => {
    nextConfig.modResults.NSHealthShareUsageDescription =
      nextConfig.modResults.NSHealthShareUsageDescription
      || 'Allow RunningGround to read your Apple Health running records so they can appear in your activity and rankings.';
    nextConfig.modResults.NSHealthUpdateUsageDescription =
      nextConfig.modResults.NSHealthUpdateUsageDescription
      || 'Allow RunningGround to save synced running records and challenge progress updates to Apple Health when you choose to keep them in sync.';

    return nextConfig;
  });
}

function withIosHealthEntitlements(config) {
  return withEntitlementsPlist(config, (nextConfig) => {
    nextConfig.modResults['com.apple.developer.healthkit'] = true;
    return nextConfig;
  });
}

function withIosAppleHealthModuleFiles(config) {
  return withDangerousMod(config, ['ios', async (nextConfig) => {
    const iosRoot = nextConfig.modRequest.platformProjectRoot;
    const projectName = nextConfig.modRequest.projectName;

    if (!iosRoot || !projectName) {
      return nextConfig;
    }

    const moduleFilePath = path.join(iosRoot, projectName, IOS_APPLE_HEALTH_MODULE_FILENAME);
    fs.mkdirSync(path.dirname(moduleFilePath), { recursive: true });

    const currentContents = fs.existsSync(moduleFilePath)
      ? fs.readFileSync(moduleFilePath, 'utf8')
      : null;

    if (currentContents !== APPLE_HEALTH_MODULE_SOURCE) {
      fs.writeFileSync(moduleFilePath, APPLE_HEALTH_MODULE_SOURCE);
    }

    return nextConfig;
  }]);
}

function withIosAppleHealthModuleProject(config) {
  return withXcodeProject(config, (nextConfig) => {
    const project = nextConfig.modResults;
    const projectName = nextConfig.modRequest.projectName;

    if (!projectName) {
      return nextConfig;
    }

    const sourceFilePath = `${projectName}/${IOS_APPLE_HEALTH_MODULE_FILENAME}`;

    IOSConfig.XcodeUtils.ensureGroupRecursively(project, projectName);
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: sourceFilePath,
      groupName: projectName,
      project,
    });
    IOSConfig.XcodeUtils.addFramework({
      project,
      projectName,
      framework: 'HealthKit.framework',
    });

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
  config = withIosHealthInfoPlist(config);
  config = withIosHealthEntitlements(config);
  config = withIosAppleHealthModuleFiles(config);
  config = withIosAppleHealthModuleProject(config);
  config = withAndroidHealthAccess(config);
  config = withAndroidHealthRationaleString(config);
  return config;
}

module.exports = createRunOncePlugin(withHealthAccess, PLUGIN_NAME, PLUGIN_VERSION);
