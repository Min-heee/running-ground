# runnigapp architecture

## Goal
Build one mobile app codebase for both iOS and Android.

## Principles
- Shared UI and product flow across platforms
- Platform-specific health integrations separated behind provider interfaces
- Backend remains common for auth, rankings, leagues, points, and sync metadata
- Avoid mixing UI code with provider-specific logic

## Suggested layers
- `app/` route entry points only
- `src/features/*` screen-level product features
- `src/domain/*` shared product types and business models
- `src/integrations/*` Apple Health / Health Connect / Garmin / Strava adapters
- `src/data/*` mock/demo data only

## Platform strategy
- iOS first-party health source: Apple Health
- Android first-party health source: Health Connect
- External providers later: Garmin, Strava
- NRC should be treated as optional / uncertain until official access path is validated

## Recommended build order
1. Finalize mobile UI and onboarding
2. Connect shared backend APIs
3. Add provider interfaces for health integrations
4. Implement iOS + Android platform-specific sync
5. Expand to Garmin / Strava
