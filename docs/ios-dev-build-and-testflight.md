# ios development build and testflight flow

## short answer
For this project, `Expo Go` is no longer enough once we need native features like Apple Health.

The correct iOS flow now is:
1. development build for real feature development
2. TestFlight for internal testing
3. App Store submission after QA

## current repo status
This repo is now prepared for that flow:
- local `eas-cli` is installed in the project
- [eas.json](/eas.json) pins the EAS CLI version used by the project
- [eas.json](/eas.json) has `development`, `preview`, `testflight`, and `production` profiles
- [app.config.ts](/app.config.ts) supports environment-based iOS bundle IDs
- npm scripts now expose development build and TestFlight commands directly
- [.env.testflight.example](/.env.testflight.example) shows the intended internal TestFlight runtime settings

## first-time setup
### 1. login to Expo
```bash
npm run eas:login
```

### 2. initialize or link the EAS project
If this project is not linked yet, run:

```bash
npm run eas:init
```

When that completes, copy the generated EAS project id into:
- local `.env`
- EAS environment variables later if needed

### 3. confirm login
```bash
npm run eas:whoami
```

## iOS development build
Use this when developing Apple Health or any other native iOS feature.

```bash
npm run build:ios:development
```

After the build is installed on the iPhone:
```bash
npm run start:dev-client
```

Then open the installed development build app on the iPhone and connect it to Metro.

## iOS TestFlight build
Use this when the feature is stable enough for internal QA.

This project now treats `TestFlight` and `production App Store release` as different runtime targets:
- `testflight`: production bundle id + preview backend
- `production`: production bundle id + production backend

### build the store-distribution binary
```bash
npm run build:ios:testflight
```

### submit that build to App Store Connect / TestFlight
```bash
npm run submit:ios:testflight
```

After the build is visible in TestFlight, run the phone pass using:
- [testflight-real-device-qa.md](/docs/testflight-real-device-qa.md)

## required values before TestFlight submission
- Expo account login
- paid Apple Developer account
- valid iOS bundle identifier
  - current repo default: `com.minheee.runnigapp`
- `EAS_PROJECT_ID`
- stable preview backend URL for the `testflight` profile
  - current placeholder: `https://preview-api.runnigapp.com/api`

`ascAppId` is now already wired in [eas.json](/eas.json), so repeated submits do not need to recreate the App Store Connect app.

## what happens after submit
Submitting with EAS for iOS uploads the build to App Store Connect, and it appears in TestFlight after processing.

That does **not** mean the app is live on the App Store yet.
TestFlight is still an internal or external testing stage before final review submission.

## recommended next practical step
1. log in with Expo
2. link the EAS project
3. create the first iOS development build
4. finish Apple Health reader work there
5. move stable builds to TestFlight
6. follow the real-device QA flow before calling the build stable
