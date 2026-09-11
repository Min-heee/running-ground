import { Alert, Linking, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { shouldShowBackgroundRestrictionNotice } from './backgroundRestrictionNoticeModel';

// 삼성 "백그라운드 사용 제한" 1회 안내 (오너 2026-08-13).
//
// 배터리 최적화 제외(경쟁 프리플라이트의 차단 게이트)와 별개로, 유저가 삼성 설정에서 앱을
// [설정 → 배터리 → 백그라운드 사용 제한] 목록에 직접 넣어두면 화면 꺼짐 측정이 OS 차원에서
// 멈출 수 있다 — 그 상태는 새 네이티브 빌드(ActivityManager.isBackgroundRestricted) 없이는
// 앱이 감지할 수 없어서, OTA로 가능한 최선인 "경쟁 러닝 첫 진입 때 딱 한 번 확인 안내"를
// 띄운다. 자동 감지 차단 게이트는 빌드 46 백로그.
//
// 시점: 프리플라이트의 모든 게이트(위치·모션·배터리 제외)가 통과한 직후 — 다른 다이얼로그
// 위에 절대 겹치지 않는다. '설정 열기'는 그 진입을 한 번 멈추고(설정에서 돌아와 다시 누르면
// 그대로 통과), '확인했어요'는 곧장 진행한다. 어느 쪽이든 다시는 안 보여준다.
//
// 저장은 팁 말풍선과 같은 관례: 웹 localStorage / 네이티브 SecureStore, 실패는 전부 삼키고
// READ 실패는 '이미 봄'으로 — 고장난 저장소가 매 진입을 가로막으면 안 된다.
const NOTICE_SEEN_STORAGE_KEY = 'runningground.bgRestrictionNoticeSeen.v1';

export { shouldShowBackgroundRestrictionNotice } from './backgroundRestrictionNoticeModel';

function getWebStorage() {
  if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage) {
    return window.localStorage;
  }

  return null;
}

async function hasSeenNotice(): Promise<boolean> {
  const webStorage = getWebStorage();

  if (webStorage) {
    try {
      return webStorage.getItem(NOTICE_SEEN_STORAGE_KEY) === 'true';
    } catch {
      return true;
    }
  }

  try {
    if (!(await SecureStore.isAvailableAsync())) {
      return true;
    }

    return (await SecureStore.getItemAsync(NOTICE_SEEN_STORAGE_KEY)) === 'true';
  } catch {
    return true;
  }
}

async function markNoticeSeen(): Promise<void> {
  const webStorage = getWebStorage();

  if (webStorage) {
    try {
      webStorage.setItem(NOTICE_SEEN_STORAGE_KEY, 'true');
    } catch {
      // 실패해도 다음에 한 번 더 보일 뿐 — 진입을 막지 않는다.
    }
    return;
  }

  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.setItemAsync(NOTICE_SEEN_STORAGE_KEY, 'true');
    }
  } catch {
    // 위와 동일.
  }
}

// true = 진행, false = 이 진입은 멈춤(유저가 설정으로 감). 안드로이드가 아니거나 이미 봤으면
// 즉시 true.
export async function confirmBackgroundRestrictionOnce(): Promise<boolean> {
  if (!shouldShowBackgroundRestrictionNotice({ isAndroid: Platform.OS === 'android', seen: await hasSeenNotice() })) {
    return true;
  }

  void markNoticeSeen();

  return new Promise((resolve) => {
    Alert.alert(
      '배터리 설정 확인이 필요해요',
      '갤럭시 등 일부 폰은 [설정 → 배터리 → 백그라운드 사용 제한] 목록에 앱이 들어 있으면 화면을 꺼둔 동안 측정이 멈출 수 있어요.\n\n러닝그라운드가 그 목록에 없는지 딱 한 번만 확인해 주세요.',
      [
        {
          text: '설정 열기',
          onPress: () => {
            void Linking.openSettings();
            resolve(false);
          },
        },
        { text: '확인했어요', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(true) },
    );
  });
}
