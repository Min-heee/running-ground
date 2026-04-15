# native health integration

## what is now in place
- Expo app config includes a local health access config plugin.
- iOS builds now prepare HealthKit entitlement and `NSHealthShareUsageDescription`.
- Android builds now prepare Health Connect read permissions and query visibility for the Health Connect package.
- The app UI now explains whether the current device is:
  - the right platform
  - still in Expo Go
  - missing source connection
  - or already at the “native bridge next” stage

## what this means
The project is now ready for the **next implementation step**:
- iOS: read Apple Health running workouts and convert them into shared import payloads
- Android: read Health Connect running records and convert them into shared import payloads

Those payloads can already flow into the existing backend import queue and sync endpoints.

## current limitation
This is still **not full native sync yet**.

What is ready now:
- app config
- entitlements / permissions
- runtime readiness messaging
- backend import pipeline

What is still next:
- actual HealthKit reader implementation
- actual Health Connect reader implementation
- permission request flow tied to the native reader
- final QA in development build / preview build

## bridge contract prepared in the app
The app now expects optional native bridge modules with these names:
- `RunnigappAppleHealth`
- `RunnigappHealthConnect`

Expected method:
- `readRuns()`

Optional method:
- `isAvailable()`

Expected run shape from native:
```ts
{
  externalId?: string;
  date?: string;
  startedAt?: string;
  distanceKm?: number;
  distanceMeters?: number;
  pace?: string;
  paceMinutesPerKm?: number;
  paceSecondsPerKm?: number;
  durationSeconds?: number;
}
```

The JS layer now normalizes these records, queues them into the backend import pipeline, and runs sync immediately after.

## practical release path
1. Build a development client or preview build.
2. Finish Apple Health reader first.
3. Verify imported runs appear in home, my activity, and friend ranking.
4. Add Health Connect reader next with the same shared payload shape.
