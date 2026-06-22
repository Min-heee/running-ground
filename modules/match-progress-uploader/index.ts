import { Platform } from 'react-native';
import { EventSubscription, requireNativeModule } from 'expo-modules-core';

type MatchProgressResponseEvent = {
  // The raw 2xx response body string the native periodic re-POST already read, so JS can apply
  // the opponent's live state WITHOUT a JS timer (the whole point of the native cadence).
  body: string;
};

type MatchProgressUploaderNativeModule = {
  // NATIVE: resolves with the response body string the native side already reads (or null on
  // non-2xx / failure) so the JS background flush can apply the opponent's live state instead of
  // discarding it. Android (Kotlin) has shipped this; iOS (Swift) ships it in the NEXT build.
  upload(url: string, authToken: string, jsonBody: string): Promise<string | null>;
  // OTA-SAFETY marker — ONLY the REAL native module (Android Kotlin's behavior + the NEW iOS
  // Swift build) sets this to true. The CURRENT iOS no-op Swift binary does NOT define it, so it
  // reads back as `undefined`. This is the signal that lets isNativeMatchProgressUploaderAvailable
  // route iOS to the native path only on the new build (see below).
  available?: boolean;

  // NATIVE PERIODIC UPLOADER (NEW — ships in the NEXT native build on BOTH platforms). These are
  // the GPS+JS-independent wall-clock (~3s) cadence that re-sends the latest JS-built payload while
  // the screen is off. They are OPTIONAL on the type because the CURRENTLY INSTALLED binaries do
  // NOT define them — `typeof` guards below make every call a safe no-op on those binaries so a
  // single OTA bundle stays safe (the existing JS-timer + location-task flush remains the fallback).
  //
  // The native side NEVER recomputes distance/pace/elapsed — it only re-sends the exact jsonBody JS
  // hands it. JS stays the single source of truth.
  startPeriodicUpload?(url: string, authToken: string, jsonBody: string, intervalMs: number): void;
  updatePeriodicPayload?(url: string, authToken: string, jsonBody: string): void;
  stopPeriodicUpload?(): void;

  // BATTERY OPTIMIZATION CONTROL (NEW — Android-only, ships in the NEXT native build). Synchronous
  // Expo `Function(...)`s exposed by the Kotlin module. OPTIONAL on the type for the SAME reason as
  // the periodic fns above: the CURRENTLY INSTALLED binaries do NOT define them, so the `typeof`
  // probe below reports them unavailable and every wrapper no-ops on those binaries (single OTA
  // bundle stays safe). iOS never links these.
  //   - isIgnoringBatteryOptimizations: true when this app is already exempt from Doze/app-standby
  //     battery optimization (so screen-off periodic upload won't be throttled).
  //   - requestIgnoreBatteryOptimizations: fires the Android settings intent asking the user to
  //     exempt the app; returns true when the intent was dispatched.
  isIgnoringBatteryOptimizations?(): boolean;
  requestIgnoreBatteryOptimizations?(): boolean;

  // Emitter contract used by addListener below (Expo Events("onMatchProgressResponse")).
  addListener?(eventName: string, listener: (event: MatchProgressResponseEvent) => void): EventSubscription;
};

let nativeModule: MatchProgressUploaderNativeModule | null = null;

try {
  nativeModule = requireNativeModule<MatchProgressUploaderNativeModule>('MatchProgressUploader');
} catch {
  nativeModule = null;
}

// OTA-SAFETY: availability detection is platform-aware so a single OTA bundle is safe for BOTH
// currently-installed binaries.
//
//  - Android (current APK has the REAL Kotlin uploader): the native module registers a non-null
//    proxy with a working `upload`, so `nativeModule != null` is the correct, unchanged signal.
//    The current APK has NO `available` property, so we must NOT require it here or we would break
//    Android's already-shipped native path.
//
//  - iOS: the CURRENTLY INSTALLED TestFlight binary has the NO-OP Swift module. It DOES register a
//    non-null proxy (so `nativeModule != null` would be a FALSE positive), but it does NOT define
//    the `available` marker → `nativeModule?.available !== true` → reported UNAVAILABLE → the JS
//    flush keeps using the fetch fallback (today's behavior, unchanged). The NEXT iOS build ships
//    the REAL Swift module which sets `available = true` → reported AVAILABLE → native path.
export function isNativeMatchProgressUploaderAvailable(): boolean {
  if (nativeModule == null) {
    return false;
  }

  if (Platform.OS === 'ios') {
    // Gate iOS strictly on the explicit marker so the current no-op binary stays on JS fetch.
    return nativeModule.available === true;
  }

  // Android (and any other native platform that links the real module): a non-null proxy with a
  // real `upload` is the long-shipped availability signal — keep it unchanged.
  return true;
}

export async function uploadMatchProgressNative(
  url: string,
  authToken: string,
  jsonBody: string,
): Promise<string | null> {
  try {
    return (await nativeModule?.upload(url, authToken, jsonBody)) ?? null;
  } catch {
    // Best-effort background upload; the next location tick will retry with fresher data.
    return null;
  }
}

// OTA-SAFETY availability gate for the NEW native periodic uploader. True ONLY when the resolved
// native module actually exposes the periodic fns — i.e. ONLY on the next native build. On every
// CURRENTLY INSTALLED binary (Android APK + iOS TestFlight, neither of which has these fns) this
// returns false, so all the JS wrappers below become no-ops and the existing JS-timer +
// location-task flush remains the unchanged fallback. This is what keeps the OTA bundle safe.
export function isNativePeriodicUploaderAvailable(): boolean {
  if (nativeModule == null) {
    return false;
  }

  return (
    typeof nativeModule.startPeriodicUpload === 'function'
    && typeof nativeModule.updatePeriodicPayload === 'function'
    && typeof nativeModule.stopPeriodicUpload === 'function'
  );
}

// Start the native wall-clock cadence with the current JS-built payload. No-op (returns false) on
// any binary that lacks the native fns, so callers do not need their own guard — but they SHOULD
// still gate with isNativePeriodicUploaderAvailable() to avoid the wrapper churn on old binaries.
export function startPeriodicMatchUpload(
  url: string,
  authToken: string,
  jsonBody: string,
  intervalMs: number,
): boolean {
  if (!isNativePeriodicUploaderAvailable()) {
    return false;
  }

  try {
    nativeModule?.startPeriodicUpload?.(url, authToken, jsonBody, intervalMs);
    return true;
  } catch {
    // Best-effort: a failure to start leaves the JS-timer + location-task fallback in place.
    return false;
  }
}

// Cheaply overwrite the cached native payload (no thread restart). Called by JS on EVERY snapshot
// commit + every bg-location tick so the native re-POST always carries the freshest JS-built body.
export function updatePeriodicMatchPayload(
  url: string,
  authToken: string,
  jsonBody: string,
): boolean {
  if (!isNativePeriodicUploaderAvailable()) {
    return false;
  }

  try {
    nativeModule?.updatePeriodicPayload?.(url, authToken, jsonBody);
    return true;
  } catch {
    return false;
  }
}

// Stop + clear the native cadence (match finish / forfeit / context clear / unmount).
export function stopPeriodicMatchUpload(): boolean {
  if (!isNativePeriodicUploaderAvailable()) {
    return false;
  }

  try {
    nativeModule?.stopPeriodicUpload?.();
    return true;
  } catch {
    return false;
  }
}

// OTA-SAFETY availability gate for the NEW Android battery-optimization control. Mirrors
// isNativePeriodicUploaderAvailable EXACTLY: true ONLY when the resolved native module actually
// exposes BOTH battery fns — i.e. ONLY on the next native build. On every CURRENTLY INSTALLED
// binary (Android APK + iOS TestFlight, neither of which has these fns) this returns false, so the
// wrappers below no-op and callers can gate on it to skip the nudge entirely (no false battery
// nag on old binaries, and never on iOS). This is what keeps the OTA bundle safe.
export function isBatteryOptimizationControlAvailable(): boolean {
  if (nativeModule == null) {
    return false;
  }

  return (
    typeof nativeModule.isIgnoringBatteryOptimizations === 'function'
    && typeof nativeModule.requestIgnoreBatteryOptimizations === 'function'
  );
}

// True when this app is already exempt from Android battery optimization (Doze/app-standby), so the
// screen-off periodic upload won't be throttled. On any binary lacking the native fn this returns
// `true` (assume fine → no nag), so callers safely skip prompting on old binaries and on iOS.
export function isIgnoringBatteryOptimizations(): boolean {
  if (!isBatteryOptimizationControlAvailable()) {
    return true;
  }

  try {
    return nativeModule?.isIgnoringBatteryOptimizations?.() ?? true;
  } catch {
    // Best-effort: if the native probe throws, assume exempt so we never nag erroneously.
    return true;
  }
}

// Fire the Android settings intent asking the user to exempt this app from battery optimization.
// Returns true when the intent was dispatched, false otherwise. No-op (returns false) on any binary
// lacking the native fn and on iOS, so callers do not need their own guard.
export function requestIgnoreBatteryOptimizations(): boolean {
  if (!isBatteryOptimizationControlAvailable()) {
    return false;
  }

  try {
    return nativeModule?.requestIgnoreBatteryOptimizations?.() ?? false;
  } catch {
    return false;
  }
}

// Subscribe to the native onMatchProgressResponse emitter, which fires with the 2xx response body
// string after each native re-POST. Returns an unsubscribe fn (no-op when unavailable). The caller
// routes each body through the EXISTING applyNativeMatchStatusBody / applier guards so the opponent
// board unfreezes WITHOUT a JS timer.
export function addMatchProgressResponseListener(
  listener: (body: string) => void,
): () => void {
  if (nativeModule == null || typeof nativeModule.addListener !== 'function') {
    return () => undefined;
  }

  try {
    const subscription = nativeModule.addListener('onMatchProgressResponse', (event) => {
      if (event && typeof event.body === 'string') {
        listener(event.body);
      }
    });
    return () => {
      try {
        subscription.remove();
      } catch {
        // Best-effort teardown.
      }
    };
  } catch {
    return () => undefined;
  }
}
