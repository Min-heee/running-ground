# runnigapp architecture

## Goal
Build one mobile app codebase for both iOS and Android.

## Current phase
The project is now moving from **feature exploration** to **release preparation**.

This means the architecture should optimize for:
- shipping a real MVP
- replacing mock data with real backend state
- supporting one working end-to-end competition loop first

## Principles
- Shared UI and product flow across platforms
- Platform-specific health integrations separated behind provider interfaces
- Backend remains common for auth, rankings, friend graph, points, and sync metadata
- Avoid mixing UI code with provider-specific logic
- Avoid expanding mock-only branches when the same effort could connect real data

## Suggested layers
- `app/` route entry points only
- `src/features/*` screen-level product features
- `src/domain/*` shared product types and business models
- `src/integrations/*` Apple Health / Health Connect / Garmin / Strava adapters
- `src/lib/*` API client and server boundary
- `src/data/*` mock/demo data only, to be phased out during release work

## Release MVP focus
The first release should center on:
- auth
- profile and district setup
- one real integration path
- home summary
- my activity
- friend add by tag
- friend leaderboard
- friend activity detail

Regional battle and deep drilldown should be treated as later-phase work unless they directly support launch.

## Platform strategy
- iOS first-party health source: Apple Health
- Android first-party health source: Health Connect
- External providers later: Garmin, Strava
- NRC should be treated as optional / uncertain until official access path is validated

## Recommended build order
1. Lock release MVP scope
2. Define frontend/backend contracts for release flows
3. Add API/data layer to replace direct mock consumption
4. Connect one primary activity source
5. Connect friend leaderboard loop
6. Expand to secondary competition systems after launch readiness
