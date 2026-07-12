import Constants from 'expo-constants';
import { NativeModules, TurboModuleRegistry } from 'react-native';

// Crash reporting (#190). DSN is a public client identifier, not a secret.
const SENTRY_DSN = 'https://<SENTRY_DSN>';

let initialized = false;

// OTA SAFETY — this module ships over the air to binaries that do NOT contain
// the Sentry native module (build ≤43 shares runtimeVersion 0.1.0 with build
// 44). On those binaries the init must be a silent no-op: the SDK is loaded
// lazily via require() only after the native module is confirmed present, so
// neither module-eval side effects nor TurboModuleRegistry.getEnforcing can
// throw on an old binary.
function isNativeSentryAvailable(): boolean {
  try {
    if (NativeModules?.RNSentry != null) {
      return true;
    }

    return TurboModuleRegistry?.get?.('RNSentry') != null;
  } catch {
    return false;
  }
}

export function initSentryOnce() {
  if (initialized || __DEV__) {
    return;
  }

  if (!isNativeSentryAvailable()) {
    return;
  }

  initialized = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/react-native') as typeof import('@sentry/react-native');

    Sentry.init({
      dsn: SENTRY_DSN,
      environment: String(Constants.expoConfig?.extra?.appVariant ?? 'unknown'),
      // Crash/error reporting only for launch — no performance tracing, no PII.
      tracesSampleRate: 0,
      sendDefaultPii: false,
      enableNativeCrashHandling: true,
    });
  } catch {
    // Reporting infrastructure must never take the app down with it.
    initialized = false;
  }
}
