// 안드로이드 지도 가용성 (오너 2026-08-03) — Google Maps API 키는 versionCode 41 빌드부터
// 네이티브에 박힌다. OTA JS는 옛 바이너리(38~40)에도 내려가므로, '이 바이너리'의
// versionCode(Constants.nativeBuildVersion — OTA 매니페스트가 아니라 네이티브 진실)로
// 가른다. 키 없는 빌드에서 MapView를 그리면 빈 회색 타일만 나온다 — 그때는 기존
// 대체 카드를 유지한다.

import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const ANDROID_MAPS_MIN_VERSION_CODE = 41;

export function isAndroidMapsReady(): boolean {
  if (Platform.OS !== 'android') {
    // iOS는 애플 지도(react-native-maps 기본 프로바이더)라 키가 필요 없다.
    return true;
  }

  const versionCode = Number(Constants.nativeBuildVersion);
  return Number.isFinite(versionCode) && versionCode >= ANDROID_MAPS_MIN_VERSION_CODE;
}
