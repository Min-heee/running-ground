# RunningGround work split

## Final ownership

### MacBook side
- iOS
- Expo frontend
- OAuth / deep links
- Apple Health feasibility and integration
- user flow polish
- navigation stability
- frontend UI flow

### Desktop / Windows side
- Android builds and emulator validation
- Nest backend
- Prisma / DB
- Strava backend flow
- API stabilization
- Android auth / session / deep-link verification
- Android / backend reliability

## Branch suggestion
- `main`: stable baseline
- `feature/ios-oauth-flow`: MacBook work
- `feature/backend-android-stabilization`: desktop work

## Current repo note
- `main`: Expo SDK 54 + native tab stabilization + Android dev build setup
- `codex/simulator-parity`: adds Strava OAuth integration flow and backend integration changes

## Immediate MacBook focus
1. Review frontend OAuth/deep-link assumptions
2. Verify iOS scheme/config consistency
3. Align integration management UX with real OAuth-capable flows
4. Define frontend contract needed by backend/Desktop side

## Immediate desktop focus
1. Diff `main` vs `codex/simulator-parity` for backend/Android scope
2. Stand up backend locally
3. Validate Android dev build/emulator flow
4. Harden Strava backend flow
5. Produce Android/API bug list
