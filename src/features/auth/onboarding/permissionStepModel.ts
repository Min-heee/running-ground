// Pure state-machine helpers for the onboarding permission step. Kept free of React/React Native
// imports so the "필수 권한 게이트" + "denied routes to Settings" rules can be unit-tested
// directly (the screen and the test share this single source of truth).

import type {
  OnboardingPermissionCanAsk,
  OnboardingPermissionKey,
  OnboardingPermissionStatuses,
} from './onboardingPermissions';

// What the per-permission row should render:
// - 'granted'       -> show 허용됨, never re-prompt.
// - 'open_settings' -> already denied and the OS won't show a dialog again; offer 설정 열기.
// - 'request'       -> can still surface the OS dialog; show the 허용하기 button.
export type PermissionRowActionKind = 'granted' | 'open_settings' | 'request';

export function resolvePermissionRowAction(input: { granted: boolean; canAsk: boolean }): PermissionRowActionKind {
  if (input.granted) {
    return 'granted';
  }
  if (!input.canAsk) {
    return 'open_settings';
  }
  return 'request';
}

// 권한 단계 통과 규칙 (2026-07-13, 제품 결정: 페이지의 모든 권한이 필수 — 위치·알림·동작,
// Android면 배터리 제외까지. 권한 없이 홈에 떨어지면 첫 대결이 0.00km로 끝나거나 초대 알림을
// 영영 못 받는 반쪽 계정이 되기 때문).
// 단, "그 기기에서 영원히 켤 수 없는 것"은 게이트에서 면제한다 — 아니면 진짜 감옥이 된다:
// - 위치 "항상(백그라운드)"은 게이트 제외: 현재 Android 바이너리엔 ACCESS_BACKGROUND_LOCATION
//   자체가 없어 영원히 못 통과하고(화면꺼짐 측정은 FGS 담당), iOS Always 강제는 리젝 사유.
// - 동작은 걸음 센서가 없는 기기(에뮬레이터/일부 구형)에선 면제.
// - 배터리 제외는 네이티브 컨트롤이 있는 Android 빌드에서만 요구.
// - 건강 연동은 이 페이지에서 다루지 않는다(연동 단계·연동관리 소관 — 기기·계정 따라 영구 불가).
// 알림 필수화는 Apple 4.5.4(푸시 필수화 금지) 리젝 리스크를 오너가 인지하고 결정한 사항.
export function canAdvanceFromPermissionStep({
  statuses,
  motionAvailable,
  batteryAvailable,
  batteryExempt,
}: {
  statuses: OnboardingPermissionStatuses;
  motionAvailable: boolean;
  batteryAvailable: boolean;
  batteryExempt: boolean;
}): boolean {
  return (
    statuses.location
    && statuses.notifications
    && (statuses.motion || !motionAvailable)
    && (batteryExempt || !batteryAvailable)
  );
}

// True only when every onboarding permission is already granted — used purely for optional UI
// affordances (e.g. a "모두 허용됨" hint). It must NOT gate advancing.
export function areAllOnboardingPermissionsGranted(statuses: OnboardingPermissionStatuses): boolean {
  return (Object.keys(statuses) as OnboardingPermissionKey[]).every((key) => statuses[key]);
}

// Whether a fresh tap on this permission's row would actually surface a system dialog. Used to
// decide between firing the request and short-circuiting to Settings.
export function shouldPromptPermission(
  key: OnboardingPermissionKey,
  statuses: OnboardingPermissionStatuses,
  canAsk: OnboardingPermissionCanAsk,
): boolean {
  return !statuses[key] && canAsk[key];
}
