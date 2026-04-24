# release build guide

## current status
The app is moving in the right direction for release.
Shared navigation, auth, activity, friends, league, and backend-backed data flows are already in place.

The project is **not yet store-submit ready today**, but it is now structured so we can build toward:
- iOS internal testing
- Android internal testing
- store-ready production builds

## what changed
- `app.config.ts` now creates separate development / preview / production app variants
- `eas.json` now defines build profiles for both iOS and Android
- local-network and arbitrary-load permissions are limited to the development variant only

This keeps local development easy while making release builds safer by default.

## required environment values
These values can come from local `.env` files for development or from EAS environment variables for cloud builds.

Example files:
- development: [.env.example](/.env.example)
- preview: [.env.preview.example](/.env.preview.example)
- production: [.env.production.example](/.env.production.example)

### app/runtime
- `APP_VARIANT`
  - `development`
  - `preview`
  - `production`
- `EXPO_PUBLIC_API_BASE_URL`
  - Must point at the backend for the current environment.
  - `preview` and `production` should use a stable HTTPS backend URL.
  - `localhost`, `10.0.2.2`, local IP addresses are development-only.
- `EXPO_PUBLIC_USE_MOCK_API`
  - Keep this `false` for release work.
- `EXPO_PUBLIC_API_TIMEOUT_MS`

### native identifiers
- `IOS_BUNDLE_ID`
- `ANDROID_PACKAGE`
- `IOS_BUILD_NUMBER`
- `ANDROID_VERSION_CODE`
- `EAS_PROJECT_ID`
  - Fill this after running `npx eas init` or `npx eas build:configure`
- `EXPO_UPDATES_URL`
  - Optional override only.
  - If omitted, [app.config.ts](/app.config.ts) derives the URL from the linked EAS project id.

### map provider direction
For now, keep the running map on the default native map path so the iPhone TestFlight flow does not require Google Cloud billing.
If Android release testing needs a fully billing-free map later, evaluate an OpenStreetMap/MapLibre-based replacement as a separate native-map task.

## build profiles
Defined in [eas.json](/eas.json).

### `development`
- development client build
- internal distribution
- local-network-friendly settings

### `preview`
- internal test build
- iOS ad hoc / Android apk friendly
- best profile for device QA before store submission

### `testflight`
- store-signed internal iOS testing build
- keeps the real production bundle identifier
- should point at the EAS `preview` environment backend URL, not the final production backend
- best profile for real TestFlight QA before launch
- follow [testflight-real-device-qa.md](/docs/testflight-real-device-qa.md) for the actual iPhone pass order

### `production`
- store-oriented build
- auto-increments native build numbers
- removes development-only network allowances

## recommended release flow
1. Prepare one stable backend URL for preview and production.
2. Validate backend env first.
3. Set EAS environment variables for each environment.
4. Build `preview` for direct device QA.
5. Build `testflight` for internal iPhone QA with the real App Store bundle id.
6. Lock health integration scope for v1.
7. Build `production` for App Store / Play Store submission.

## commands
### inspect resolved Expo config
```bash
npx expo config --type public
```

### validate release env before build
```bash
npm run release:check:preview
npm run release:check:production
npm run release:check:testflight
```

This check now fails fast when:
- mock API is still enabled for preview/production
- API base URL is missing or not HTTPS
- API base URL still points to localhost, emulator host, or private LAN IP
- bundle/package identifiers still use anonymous defaults
- `EAS_PROJECT_ID` is missing or malformed

### update TestFlight preview backend URL
For TestFlight, keep temporary tunnel URLs out of [eas.json](/eas.json).
When the Cloudflare tunnel URL changes, update the EAS `preview` environment instead.

If `preview-public-info.json` or `.env` already has the current URL:

```bash
npm run preview:sync-eas-env
```

Or pass the tunnel URL directly:

```bash
npm run preview:sync-eas-env -- --api-base-url https://YOUR-TUNNEL.trycloudflare.com/api
```

Under the hood this updates:

```bash
npx eas env:create preview --name EXPO_PUBLIC_API_BASE_URL --value https://YOUR-TUNNEL.trycloudflare.com/api --visibility plaintext --type string --force
npx eas env:create preview --name EXPO_PUBLIC_USE_MOCK_API --value false --visibility plaintext --type string --force
npx eas env:create preview --name EXPO_PUBLIC_API_TIMEOUT_MS --value 10000 --visibility plaintext --type string --force
```

Then confirm the cloud build environment:

```bash
npx eas env:list preview --format long
```

### validate backend env before deploy
```bash
npm run backend:release:check:preview
npm run backend:release:check:production
```

If you use the Docker + Caddy public template:
```bash
npm run backend:check-domain -- --domain preview-api.runnigapp.com --expected-ip SERVER_PUBLIC_IP --skip-health
npm run backend:deploy:public -- --env preview --domain preview-api.runnigapp.com --email ops@runnigapp.com --sync-eas-preview
npm run backend:deploy:public -- --env production --domain api.runnigapp.com --email ops@runnigapp.com
```

For the temporary desktop preview backend:
```powershell
scripts\windows\install-preview-backend-task.cmd -Transport tailscale-funnel -StartNow
scripts\windows\start-preview-public-backend.cmd
scripts\windows\status-preview-public-backend.cmd
scripts\windows\stop-preview-public-backend.cmd
npm run preview:smoke
scripts\windows\status-preview-public-backend.cmd -RunPublicSmoke -RequireHealthy -RequireSmokeHealthy
```

`install-preview-backend-task.cmd -Transport tailscale-funnel -StartNow` registers a Windows logon bootstrap task that reruns the full desktop preview startup flow, including local preview PostgreSQL checks when configured. The bootstrap task starts the preview stack as background processes instead of trying to re-register nested scheduled tasks. `status-preview-public-backend.cmd` checks the local backend, public tunnel, admin status, store counts, backup count, PostgreSQL bridge flags, and log file paths in one place.

The older direct Docker commands are still available if `.env.preview` / `.env.production` already exist:

```bash
npm run backend:docker:public:preview
npm run backend:docker:public:production
```

Backend deployment details live in [backend/README.md](/backend/README.md).

### preview builds
```bash
npm run release:gate:preview
npm run release:gate:testflight -- --admin-token PREVIEW_ADMIN_TOKEN
npm run build:ios:preview
npm run build:android:preview
npm run build:ios:testflight
```

After the build lands on the phone, use:
- [testflight-real-device-qa.md](/docs/testflight-real-device-qa.md)

Before starting the phone pass, you can generate a seeded QA note:

```bash
npm run testflight:qa:report -- --build-label 1.0.0(15) --device "iPhone 16 Pro"
```

`release:gate:*` runs the frontend env check, backend env check, and public smoke in one pass. It now also surfaces blocking issues and warnings in one summary, and retries the public smoke once before failing so brief network hiccups are less noisy. Use `release:gate:testflight` right before a TestFlight build, and `release:gate:production -- --api-base-url https://api.runnigapp.com/api` when the real production domain is ready.

### production builds
```bash
npm run build:ios:production
npm run build:android:production
```

## still needed before real store submission
- a stable deployed backend, not a local IP
- final bundle/package identifiers
- App Store and Play Store listing assets
- privacy policy / support contact / review notes
- at least one real native health integration path for the release promise
- device QA on both iOS and Android

## honest release answer
Yes, this direction can lead to release.

But the actual release gate is no longer “more UI screens”.
The gate is:
- stable backend deployment
- native health integration
- store metadata and policies
- production build validation
