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

test('advancing is never blocked — true for every permission combination', () => {
  assert.equal(canAdvanceFromPermissionStep(ALL_DENIED), true);
  assert.equal(canAdvanceFromPermissionStep(ALL_GRANTED), true);
  assert.equal(
    canAdvanceFromPermissionStep({
      ...ALL_DENIED,
      location: true,
      backgroundLocation: false,
    }),
    true,
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

test('a denied permission can never gate finishing the step', () => {
  // Pairs the row-level "open_settings" outcome with the step-level "always advance" invariant:
  // a hard-denied permission shows Settings on its row but does not block 다음.
  const action = resolvePermissionRowAction({ granted: false, canAsk: false });
  assert.equal(action, 'open_settings');
  assert.equal(canAdvanceFromPermissionStep({ ...ALL_DENIED }), true);
});
