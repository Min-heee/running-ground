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
- should point at a stable preview backend, not the final production backend
- best profile for real TestFlight QA before launch

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
```

This check now fails fast when:
- mock API is still enabled for preview/production
- API base URL is missing or not HTTPS
- API base URL still points to localhost, emulator host, or private LAN IP
- bundle/package identifiers still use anonymous defaults
- `EAS_PROJECT_ID` is missing or malformed

### validate backend env before deploy
```bash
npm run backend:release:check:preview
npm run backend:release:check:production
```

If you use the Docker + Caddy public template:
```bash
npm run backend:docker:public:preview
npm run backend:docker:public:production
```

Backend deployment details live in [backend/README.md](/backend/README.md).

### preview builds
```bash
npm run build:ios:preview
npm run build:android:preview
npm run build:ios:testflight
```

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
