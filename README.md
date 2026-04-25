# RunningGround

Expo Router based running app prototype.

## Desktop-first dev flow

This repo is now set up so the Android emulator and backend can run on a stronger desktop machine.

### 1. Install dependencies

```bash
npm install
```

### 2. Create env file

```bash
cp .env.example .env
```

If backend and Android emulator run on the same Windows desktop:

```env
EXPO_PUBLIC_USE_MOCK_API=false
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8081/api
EXPO_PUBLIC_API_TIMEOUT_MS=10000
```

Why `10.0.2.2`:
- Android Emulator reaches the host machine through `10.0.2.2`, not `localhost`.

If you use a physical device instead of the emulator, replace `10.0.2.2` with the desktop machine LAN IP.

For release-oriented configs, use these examples instead:
- preview: [.env.preview.example](/.env.preview.example)
- production: [.env.production.example](/.env.production.example)

### 3. Start the backend on the desktop

Run the file-based MVP backend on port `8081`.

Recommended command:

```bash
node --watch backend/src/server.mjs
```

Expected API base URL:

```text
http://10.0.2.2:8081/api
```

### 4. Start Metro on port 8089

```bash
npm run start:dev-client -- -p 8089
```

### 5. Run Android

First native install on the desktop:

```bash
npx expo run:android --port 8089
```

After the dev client is installed, you can also use:

```bash
npm run start:dev-client -- -p 8089
```

### 6. Windows helper scripts

If you are running the Android GUI on a Windows desktop, these helper scripts are available:

```text
scripts\windows\start-dev-stack.cmd
scripts\windows\start-backend.cmd
scripts\windows\start-emulator.cmd
scripts\windows\start-metro.cmd
scripts\windows\install-android-app.cmd
```

Recommended order on Windows:

1. `scripts\windows\start-dev-stack.cmd`
2. Wait for the backend and Metro terminals to finish booting
3. Wait for the emulator window to finish booting
4. `scripts\windows\install-android-app.cmd`

## Release env check

Before preview or production builds, run:

```bash
npm run release:check:preview
npm run release:check:production
```

This now blocks the common release mistakes:
- mock API accidentally left on
- backend URL still pointing to localhost or emulator host
- backend URL not using HTTPS
- bundle/package identifiers still using anonymous defaults

For backend release deployment, check [backend/README.md](/backend/README.md). It now includes:
- backend preview/production env validation
- Docker + Caddy public HTTPS deployment template
- preview/production example env files

## Current backend-aware flows

- Account login
- Account signup
- Session restore with persistent storage
- My profile fetch
- Home summary fetch
- My activity fetch
- Friend leaderboard and request actions
- Friend activity and run detail
- District personal and region league
- Integration status fetch
- Integration sync
- Friend request creation
- Basic profile edit save

## Notes

- Social login buttons are still mock-only. In real backend mode they intentionally guide users to account login.
- Session persistence uses `expo-secure-store` on native platforms and `localStorage` on web.
- iOS post-Expo Go workflow is documented in [docs/ios-dev-build-and-testflight.md](/docs/ios-dev-build-and-testflight.md).
- Release build setup is documented in [docs/release-build-guide.md](/docs/release-build-guide.md).
- For local smoke tests, start with:
  - login -> connect sources -> home
  - signup -> connect sources -> home
  - my page -> edit profile
  - add friend -> request by tag
