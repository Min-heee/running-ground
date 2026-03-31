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
- `USE_MOCK_API = true` is intentional for now.
- This is a release-prep step, not a final networking implementation.
- Once backend contracts are confirmed, paths and response shapes can be adjusted centrally.
