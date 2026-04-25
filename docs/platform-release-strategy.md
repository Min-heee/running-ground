# platform release strategy

## Goal
Ship one mobile app codebase to both iOS and Android without splitting the product into separate apps or repositories.

## Core rule
Keep as much of the product as possible in shared code.
Only split what must be platform-specific.

---

## Shared across iOS and Android
These should remain common inside `runningground`.

### Shared product/UI
- onboarding
- signup/login
- home dashboard
- my activity
- run detail
- friend add by tag
- friend leaderboard
- friend activity detail
- profile/settings screens
- integration management UI shell

### Shared app logic
- route structure in `app/`
- domain models in `src/domain/`
- API client and service layer in `src/lib/api/`
- feature components in `src/features/`
- friend/ranking/home business presentation logic

### Shared backend contract
The backend should not care whether the request came from iOS or Android for:
- auth
- profile
- friend system
- rankings
- runs already synced into backend
- sync metadata

---

## iOS-only responsibility
### Primary health source
- Apple Health

### iOS-specific work
- permission flow for Apple Health access
- provider implementation for reading workout/running data
- mapping Apple Health records into shared run-sync payloads
- App Store permission descriptions and review notes

---

## Android-only responsibility
### Primary health source
- Health Connect

### Android-specific work
- Health Connect availability check
- permission flow for health data access
- provider implementation for reading running/workout data
- mapping Health Connect records into shared run-sync payloads
- Play Store data safety and permission documentation

---

## Recommended v1 platform approach
To keep release speed high, do **not** require identical health integration maturity on day one.

### Recommended stance
- ship the app architecture for both platforms
- keep shared product flows common
- finish one primary health integration first
- allow the second platform to follow after the shared product loop is stable

### Current recommendation
- first fully supported health path: **Apple Health**
- Android stays structurally ready for Health Connect
- if needed, Android can ship with reduced sync capability first

This is still compatible with a shared-codebase, dual-platform release strategy.

---

## What the frontend should expect from backend
The backend should normalize platform differences.

### App should receive shared shapes like:
- home summary
- my activity list
- friend leaderboard
- friend activity
- integration status
- sync status metadata

### App should not depend on raw provider-specific formats
For example:
- do not expose Apple Health raw models directly to screen components
- do not expose Health Connect raw models directly to screen components

Provider-specific data should be converted into shared API payloads before UI consumption.

---

## Release contract principle
The UI should think in terms of:
- user
- run
- friend
- leaderboard
- source status
- sync result

Not in terms of:
- HKWorkout
- Health Connect record internals
- provider-specific permission object shapes

---

## Code organization direction

### Shared
- `app/*`
- `src/features/*`
- `src/domain/*`
- `src/lib/api/*`

### Platform integration boundary
- `src/integrations/provider.ts`
- future platform-specific provider files if needed
- small adapter layer only

### Rule
Do not let platform-specific integration logic spread into screen files.
Keep screen files platform-agnostic.

---

## Release decision rule
For each new task ask:

1. Is this needed for both platforms?
   - If yes, put it in shared code.
2. Is this only about health data access or OS permissions?
   - If yes, keep it in integration/platform boundary.
3. Does this help v1 ship faster?
   - If no, move it after launch.
