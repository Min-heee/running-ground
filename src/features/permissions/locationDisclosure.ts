import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  LOCATION_DISCLOSURE_AGREE_LABEL,
  LOCATION_DISCLOSURE_DECLINE_LABEL,
  LOCATION_DISCLOSURE_MESSAGE,
  LOCATION_DISCLOSURE_TITLE,
} from '@/features/permissions/locationDisclosureCopy';

// Google Play 명시적 공개 게이트 (2026-08-05 정책 거절 대응): 앱의 모든 위치 런타임
// 권한 요청 경로(온보딩 체크리스트 · 런 시작 · 경쟁 프리플라이트)가 OS 팝업을 띄우기
// "직전"에 이 게이트를 통과한다. 동의를 누르는 즉시 호출부가 OS 요청을 이어서 실행
// 하므로 "공개 직후 권한 요청" 요건이 성립한다. 동의는 한 번 받으면 저장되어 다시
// 묻지 않는다 (이미 권한이 허용된 상태면 호출부가 요청 자체를 건너뛴다).

const CONSENT_STORAGE_KEY = 'runningground.locationDisclosureConsent.v1';

let memoizedConsent = false;
let pendingPrompt: Promise<boolean> | null = null;

async function readStoredConsent(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(CONSENT_STORAGE_KEY)) === 'agreed';
  } catch {
    return false;
  }
}

async function storeConsent(): Promise<void> {
  try {
    await SecureStore.setItemAsync(CONSENT_STORAGE_KEY, 'agreed');
  } catch {
    // 저장 실패해도 세션 메모이즈로 이번 실행 동안은 다시 묻지 않는다.
  }
}

function promptDisclosure(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      LOCATION_DISCLOSURE_TITLE,
      LOCATION_DISCLOSURE_MESSAGE,
      [
        { text: LOCATION_DISCLOSURE_DECLINE_LABEL, style: 'cancel', onPress: () => resolve(false) },
        { text: LOCATION_DISCLOSURE_AGREE_LABEL, onPress: () => resolve(true) },
      ],
      // 바깥 탭/뒤로가기로 슬쩍 닫히면 "명시적 동의"가 아니므로 버튼으로만 닫힌다.
      // onDismiss는 안드로이드 액티비티 재생성 등 예외적 소멸에서 promise가
      // 영영 안 풀려 pendingPrompt가 굳는 사고 방지용 — 거절로 처리한다.
      { cancelable: false, onDismiss: () => resolve(false) },
    );
  });
}

// 프리플라이트처럼 "요건을 채운 공개 문구 + 명시적 수락 버튼"을 자체 알림으로 이미
// 보여준 호출부가 동의를 기록하는 출구 — 같은 문구가 연달아 두 번 뜨는 것을 막는다.
export async function markLocationDisclosureConsented(): Promise<void> {
  memoizedConsent = true;
  await storeConsent();
}

export async function ensureLocationDisclosureConsent(): Promise<boolean> {
  if (memoizedConsent) {
    return true;
  }
  if (await readStoredConsent()) {
    memoizedConsent = true;
    return true;
  }

  // 온보딩 화면 등에서 두 경로가 거의 동시에 게이트를 두드려도 알림은 한 장만 띄운다.
  if (!pendingPrompt) {
    pendingPrompt = promptDisclosure().finally(() => {
      pendingPrompt = null;
    });
  }
  const agreed = await pendingPrompt;

  if (agreed) {
    memoizedConsent = true;
    await storeConsent();
  }
  return agreed;
}
