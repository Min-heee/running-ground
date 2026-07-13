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

const GATE_DEFAULTS = { motionAvailable: true, batteryAvailable: false, batteryExempt: false };

test('전부 필수: 위치·알림·동작이 모두 켜져야 다음이 열린다', () => {
  assert.equal(canAdvanceFromPermissionStep({ statuses: ALL_DENIED, ...GATE_DEFAULTS }), false);
  assert.equal(canAdvanceFromPermissionStep({ statuses: ALL_GRANTED, ...GATE_DEFAULTS }), true);
  // 하나라도 빠지면 막힌다.
  assert.equal(
    canAdvanceFromPermissionStep({
      statuses: { ...ALL_GRANTED, notifications: false },
      ...GATE_DEFAULTS,
    }),
    false,
  );
  assert.equal(
    canAdvanceFromPermissionStep({
      statuses: { ...ALL_GRANTED, motion: false },
      ...GATE_DEFAULTS,
    }),
    false,
  );
  assert.equal(
    canAdvanceFromPermissionStep({
      statuses: { ...ALL_GRANTED, location: false },
      ...GATE_DEFAULTS,
    }),
    false,
  );
});

test('위치 "항상(백그라운드)"과 건강 연동은 게이트에 안 들어간다', () => {
  // backgroundLocation/health가 영원히 false여도(현재 Android 빌드·미연동 계정의 실제 상태) 통과.
  assert.equal(
    canAdvanceFromPermissionStep({
      statuses: { ...ALL_GRANTED, backgroundLocation: false, health: false },
      ...GATE_DEFAULTS,
    }),
    true,
  );
});

test('영원히 켤 수 없는 항목은 면제된다 (감옥 금지)', () => {
  // 걸음 센서 없는 기기: 동작 없이 통과.
  assert.equal(
    canAdvanceFromPermissionStep({
      statuses: { ...ALL_GRANTED, motion: false },
      motionAvailable: false,
      batteryAvailable: false,
      batteryExempt: false,
    }),
    true,
  );
  // Android 배터리 컨트롤이 있으면 제외까지 받아야 열린다.
  assert.equal(
    canAdvanceFromPermissionStep({
      statuses: ALL_GRANTED,
      motionAvailable: true,
      batteryAvailable: true,
      batteryExempt: false,
    }),
    false,
  );
  assert.equal(
    canAdvanceFromPermissionStep({
      statuses: ALL_GRANTED,
      motionAvailable: true,
      batteryAvailable: true,
      batteryExempt: true,
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
