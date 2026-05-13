import { Platform } from 'react-native';

// Android live match road can be switched back to the full visual treatment from here.
export const ANDROID_LIGHTWEIGHT_LIVE_MATCH = true;

export const USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI = (
  Platform.OS === 'android' && ANDROID_LIGHTWEIGHT_LIVE_MATCH
);
