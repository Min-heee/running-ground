import { NativeModules, Platform } from 'react-native';

// Runtime module-availability gate for the iOS Apple-Health integration.
//
// WHY availability instead of Platform.OS: this JS ships over OTA to EVERY
// installed binary at once. Build 48 was submitted HealthKit-free for the App
// Store 2.5.1 resolution — its binary has no RunnigappAppleHealth native
// module — while build 49+ restores the reader (plugins/withHealthAccess.js).
// Gating on the module's ACTUAL presence lets one bundle serve both: on build
// 48 every Apple-Health surface stays hidden and iOS degrades exactly like the
// HealthKit-free build, and on build 49+ Apple Health appears automatically
// with no further OTA or version sniffing.
//
// The pure catalog/selector/guide models (node-tested, react-native-free) take
// this as a plain `appleHealthAvailable` boolean parameter; the impure
// wrappers and screens call this helper to supply it.
export function isAppleHealthModuleAvailable(): boolean {
  return Platform.OS === 'ios' && NativeModules.RunnigappAppleHealth != null;
}
