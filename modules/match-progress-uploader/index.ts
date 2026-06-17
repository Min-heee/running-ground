import { requireNativeModule } from 'expo-modules-core';

type MatchProgressUploaderNativeModule = {
  // NATIVE (Android, next build): now async — resolves with the response body string the
  // native side already reads (or null on non-2xx / failure) so the JS background flush can
  // apply the opponent's live state instead of discarding it.
  upload(url: string, authToken: string, jsonBody: string): Promise<string | null>;
};

let nativeModule: MatchProgressUploaderNativeModule | null = null;

try {
  nativeModule = requireNativeModule<MatchProgressUploaderNativeModule>('MatchProgressUploader');
} catch {
  nativeModule = null;
}

export function isNativeMatchProgressUploaderAvailable(): boolean {
  return nativeModule != null;
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
