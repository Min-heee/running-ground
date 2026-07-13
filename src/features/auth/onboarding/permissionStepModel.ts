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

// 권한 단계 통과 규칙 (2026-07-13, 제품 결정: 건너뛰기 제거 — 권한 없이 홈에 떨어지면 첫
// 대결이 0.00km로 끝나는 최악의 첫인상이 된다):
// - 필수 = 포그라운드 위치 + 동작. 앱의 핵심 기능(측정·케이던스)에 직결된 것만 막는다.
// - 위치 "항상(백그라운드)"은 필수가 아니다: 현재 Android 바이너리엔 ACCESS_BACKGROUND_LOCATION
//   자체가 없어 영원히 못 통과하는 함정이 되고(화면꺼짐 측정은 FGS 담당), iOS에서 Always 강제는
//   심사 리젝 사유다. 경쟁 입장 시 preflight가 따로 끌어올린다.
// - 동작은 걸음 센서가 없는 기기(에뮬레이터/일부 구형)에선 영원히 못 켜므로 센서 있을 때만 필수.
// - 알림은 절대 게이트에 넣지 않는다 (Apple 4.5.4: 푸시 필수화 금지).
export function canAdvanceFromPermissionStep({
  statuses,
  motionAvailable,
}: {
  statuses: OnboardingPermissionStatuses;
  motionAvailable: boolean;
}): boolean {
  return statuses.location && (statuses.motion || !motionAvailable);
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
