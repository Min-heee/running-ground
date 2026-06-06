import { requireNativeModule } from 'expo-modules-core';

type MatchProgressUploaderNativeModule = {
  upload(url: string, authToken: string, jsonBody: string): void;
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

export function uploadMatchProgressNative(url: string, authToken: string, jsonBody: string): void {
  try {
    nativeModule?.upload(url, authToken, jsonBody);
  } catch {
    // Best-effort background upload; the next location tick will retry with fresher data.
  }
}
