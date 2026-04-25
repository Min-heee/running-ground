# MacBook start report

## Started first
- Created branch `feature/ios-oauth-flow`
- Inspected current app config and integration screens for iOS/OAuth/deep-link readiness

## Immediate findings
- `app.json` already defines scheme: `runningground`
- `expo-linking` is installed
- Main branch UI still looks mostly MVP/mock-oriented for integrations
- `connect-sources.tsx` currently recommends Apple Health / Health Connect / Manual only
- Strava is present in domain/mock references, but not surfaced in the current main integration UI
- This means the Strava/OAuth flow likely lives mainly in `codex/simulator-parity` and needs frontend reconciliation before merge

## Next MacBook tasks
1. Compare `main` with `codex/simulator-parity` for iOS/frontend OAuth-related changes
2. Define the frontend deep-link/OAuth contract to keep backend/Desktop aligned
3. Update or prepare integration UI so iOS flow can support real provider-based connection states cleanly
