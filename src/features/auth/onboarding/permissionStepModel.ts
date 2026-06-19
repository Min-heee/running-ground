// Pure state-machine helpers for the onboarding permission step. Kept free of React/React Native
// imports so the "skip never blocks" + "denied routes to Settings" rules can be unit-tested
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

// Advancing/finishing onboarding must NEVER depend on permission state — this always returns true.
// It exists so the invariant is explicit and locked by a test: no permission outcome can trap the
// user on the step.
export function canAdvanceFromPermissionStep(_statuses: OnboardingPermissionStatuses): boolean {
  return true;
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
