# runnigapp

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

If backend and Android emulator run on the same desktop:

```env
EXPO_PUBLIC_USE_MOCK_API=false
EXPO_PUBLIC_API_BASE_URL=http://localhost:8081/api
EXPO_PUBLIC_API_TIMEOUT_MS=10000
```

If you use a physical device instead of the emulator, replace `localhost` with the desktop machine LAN IP.

### 3. Start the backend on the desktop

Run your backend server on port `8081`.

Expected base URL:

```text
http://localhost:8081/api
```

### 4. Start Metro

```bash
npm run start:dev-client
```

### 5. Run Android

First native install on the desktop:

```bash
npx expo run:android
```

After the dev client is installed, you can also use:

```bash
npm run start:android:dev
```

## Current backend-aware flows

- Account login
- Account signup
- Session restore with persistent storage
- My profile fetch
- Integration status fetch
- Friend request creation
- Basic profile edit save

## Notes

- Social login buttons are still mock-only. In real backend mode they intentionally guide users to account login.
- Session persistence uses `expo-secure-store` on native platforms and `localStorage` on web.
- For local smoke tests, start with:
  - login -> connect sources -> home
  - signup -> connect sources -> home
  - my page -> edit profile
  - add friend -> request by tag
