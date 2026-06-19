import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

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
