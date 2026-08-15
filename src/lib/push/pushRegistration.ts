// 원격 푸시 등록 (오너 2026-07-31: 공지사항을 폰 알림으로).
//
// 흐름: 로그인 상태로 앱이 뜨면 → 알림 권한 확인 → Expo 푸시 토큰 발급 → 서버 저장.
// 서버는 관리자가 공지를 등록할 때 저장된 토큰으로 Expo Push를 쏜다.
//
// 실패는 전부 조용히 삼킨다: 푸시 권한을 거절했거나, 시뮬레이터거나, 아직 푸시
// 자격증명(APNs 키/FCM)이 없는 빌드면 토큰 발급이 던진다 — 그때 앱이 죽으면 안 된다.
// 그런 기기는 인앱 알림센터로만 공지를 보게 되고, 자격증명이 붙은 빌드부터 자동으로
// 푸시가 살아난다 (이 코드는 그대로 둬도 된다).

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
// 순환 import 차단 (2026-08-15): 배럴(@/services, @/lib/session)을 거치면
// session → authSessionFacade → 이 파일 → @/services → authService → session 으로
// 고리가 닫혀 웹 번들이 초기화 중 undefined를 읽고 크래시한다. 구체 모듈을 직접 가리킨다.
import { getIsSignedIn } from '@/lib/session/sessionState';
import { registerPushToken, unregisterPushToken } from '@/services/profileService';

let lastRegisteredToken: string | null = null;

function resolveProjectId(): string | null {
  const easProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  return typeof easProjectId === 'string' && easProjectId ? easProjectId : null;
}

async function resolveExpoPushToken(): Promise<string | null> {
  const projectId = resolveProjectId();

  if (!projectId) {
    return null;
  }

  // 권한은 여기서 요청하지 않는다 — iOS의 1회성 프롬프트는 온보딩 권한 화면과 매치
  // 알림 흐름이 맥락과 함께 띄운다. 이미 허용된 기기만 조용히 등록하고, 나중에 유저가
  // 허용하면 다음 실행/로그인 때 자연스럽게 등록된다.
  const currentPermission = await Notifications.getPermissionsAsync();

  if (!currentPermission.granted) {
    return null;
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
  return typeof tokenResponse?.data === 'string' && tokenResponse.data ? tokenResponse.data : null;
}

// 앱 부팅/로그인 직후 호출 — 이미 같은 토큰을 올렸으면 네트워크를 태우지 않는다.
export async function syncPushRegistration(): Promise<void> {
  try {
    if (Platform.OS === 'web' || !getIsSignedIn()) {
      return;
    }

    const token = await resolveExpoPushToken();

    if (!token || token === lastRegisteredToken) {
      return;
    }

    await registerPushToken({
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    lastRegisteredToken = token;
  } catch {
    // 권한 거절 / 시뮬레이터 / 푸시 자격증명 없는 빌드 — 인앱 알림센터로 폴백.
  }
}

// 로그아웃 시 호출 — 이 기기로 더는 알림이 가지 않게 서버에서 토큰을 지운다.
export async function clearPushRegistration(): Promise<void> {
  const token = lastRegisteredToken;
  lastRegisteredToken = null;

  if (!token) {
    return;
  }

  try {
    await unregisterPushToken(token);
  } catch {
    // 지우지 못해도 다음 로그인 때 토큰 주인이 갱신되므로 치명적이지 않다.
  }
}
