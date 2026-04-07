# frontend data layer plan

## Goal
Move the app from direct `src/data/mock.ts` consumption to a release-oriented API boundary.

## Why
Right now many screens import mock arrays directly.
That is fine for prototyping, but it slows release because screens become tightly coupled to demo data.

A thin data layer gives us:
- one place to switch from mock to server data
- typed API boundaries
- easier loading/error handling later
- less churn in screen components

## Added structure
- `src/lib/api/config.ts`
  - base URL and mock toggle
- `src/lib/api/client.ts`
  - shared fetch wrapper
- `src/lib/api/types.ts`
  - response contracts used by the app
- `src/lib/api/services.ts`
  - feature-facing fetch functions with mock fallback

## Initial service surface
- `fetchHomeSummary()`
- `fetchMyActivity()`
- `fetchFriendLeaderboard()`
- `fetchFriendActivity()`
- `fetchIntegrationStatus()`
- `fetchMyProfile()`

## Transition strategy

### Phase 1
Keep current UI working while introducing service functions with mock fallback.

### Phase 2
Update screens to consume services instead of importing mock data directly.

### Phase 3
Turn off mock mode and connect real backend endpoints.

## Notes
- The app can now switch between mock mode and a real backend with Expo public env vars.
- For desktop simulator development, keep the backend server on the desktop machine and point `EXPO_PUBLIC_API_BASE_URL` to that machine.
- If the simulator runs on the same desktop as the backend, `http://localhost:8081/api` is fine.
- If a physical device is used, replace `localhost` with the desktop machine LAN IP.
- Set `EXPO_PUBLIC_USE_MOCK_API=false` to use the real backend.
- Once backend contracts are confirmed, paths and response shapes can still be adjusted centrally.
