import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  OnboardingPermissionCanAsk,
  OnboardingPermissionStatuses,
} from './onboardingPermissions';
import {
  areAllOnboardingPermissionsGranted,
  canAdvanceFromPermissionStep,
  resolvePermissionRowAction,
  shouldPromptPermission,
} from './permissionStepModel';

const ALL_DENIED: OnboardingPermissionStatuses = {
  location: false,
  backgroundLocation: false,
  notifications: false,
  motion: false,
  health: false,
};

const ALL_GRANTED: OnboardingPermissionStatuses = {
  location: true,
  backgroundLocation: true,
  notifications: true,
  motion: true,
  health: true,
};

const ALL_ASKABLE: OnboardingPermissionCanAsk = {
  location: true,
  backgroundLocation: true,
  notifications: true,
  motion: true,
  health: true,
};

test('row action shows 허용됨 when granted, even if the OS would no longer prompt', () => {
  assert.equal(resolvePermissionRowAction({ granted: true, canAsk: true }), 'granted');
  assert.equal(resolvePermissionRowAction({ granted: true, canAsk: false }), 'granted');
});

test('row action offers Settings when denied and the OS will not re-prompt', () => {
  assert.equal(resolvePermissionRowAction({ granted: false, canAsk: false }), 'open_settings');
});

test('row action offers the request button on a fresh, still-promptable permission', () => {
  assert.equal(resolvePermissionRowAction({ granted: false, canAsk: true }), 'request');
});

test('필수 게이트: 포그라운드 위치 + 동작이 있어야 다음이 열린다', () => {
  assert.equal(canAdvanceFromPermissionStep({ statuses: ALL_DENIED, motionAvailable: true }), false);
  assert.equal(canAdvanceFromPermissionStep({ statuses: ALL_GRANTED, motionAvailable: true }), true);
  // 위치만 있고 동작이 없으면 막힌다.
  assert.equal(
    canAdvanceFromPermissionStep({
      statuses: { ...ALL_DENIED, location: true },
      motionAvailable: true,
    }),
    false,
  );
  // 필수 둘이 켜지면 나머지(알림/건강/배경위치)는 꺼져 있어도 열린다.
  assert.equal(
    canAdvanceFromPermissionStep({
      statuses: { ...ALL_DENIED, location: true, motion: true },
      motionAvailable: true,
    }),
    true,
  );
});

test('위치 "항상(백그라운드)"은 게이트에 절대 안 들어간다 — Android 매니페스트에 없음', () => {
  // backgroundLocation이 영원히 false여도(현재 Android 빌드의 실제 상태) 통과되어야 한다.
  assert.equal(
    canAdvanceFromPermissionStep({
      statuses: { ...ALL_DENIED, location: true, motion: true, backgroundLocation: false },
      motionAvailable: true,
    }),
    true,
  );
});

test('걸음 센서가 없는 기기는 동작 없이도 통과된다 (영원 불가 권한으로 가둘 금지)', () => {
  assert.equal(
    canAdvanceFromPermissionStep({
      statuses: { ...ALL_DENIED, location: true },
      motionAvailable: false,
    }),
    true,
  );
  // 센서가 없어도 위치 없이는 못 간다.
  assert.equal(
    canAdvanceFromPermissionStep({ statuses: ALL_DENIED, motionAvailable: false }),
    false,
  );
});

test('areAllOnboardingPermissionsGranted reflects full grant state only', () => {
  assert.equal(areAllOnboardingPermissionsGranted(ALL_GRANTED), true);
  assert.equal(areAllOnboardingPermissionsGranted(ALL_DENIED), false);
  assert.equal(
    areAllOnboardingPermissionsGranted({ ...ALL_GRANTED, motion: false }),
    false,
  );
});

test('shouldPromptPermission is true only when not granted and still askable', () => {
  assert.equal(shouldPromptPermission('location', ALL_DENIED, ALL_ASKABLE), true);
  // Already granted -> do not re-prompt.
  assert.equal(shouldPromptPermission('location', ALL_GRANTED, ALL_ASKABLE), false);
  // Denied and cannot ask again -> route to Settings instead of prompting.
  assert.equal(
    shouldPromptPermission('notifications', ALL_DENIED, { ...ALL_ASKABLE, notifications: false }),
    false,
  );
});

test('필수 아닌 권한(알림)의 하드 거부는 진행을 막지 않는다', () => {
  // 행 레벨에선 설정 열기를 안내하되, 필수 두 권한만 켜져 있으면 다음은 열린다.
  const action = resolvePermissionRowAction({ granted: false, canAsk: false });
  assert.equal(action, 'open_settings');
  assert.equal(
    canAdvanceFromPermissionStep({
      statuses: { ...ALL_DENIED, location: true, motion: true, notifications: false },
      motionAvailable: true,
    }),
    true,
  );
});

test('motion is a first-class grantable permission (no Android native-build special case)', () => {
  // Android ACTIVITY_RECOGNITION is manifest-declared, so motion follows the SAME grant flow as
  // every other permission on both platforms: request when askable, Settings once hard-denied,
  // 허용됨 when granted. There is no longer any motion-specific "needs native build" branch.
  assert.equal(shouldPromptPermission('motion', ALL_DENIED, ALL_ASKABLE), true);
  assert.equal(resolvePermissionRowAction({ granted: false, canAsk: true }), 'request');
  assert.equal(
    shouldPromptPermission('motion', ALL_DENIED, { ...ALL_ASKABLE, motion: false }),
    false,
  );
  assert.equal(resolvePermissionRowAction({ granted: false, canAsk: false }), 'open_settings');
});
