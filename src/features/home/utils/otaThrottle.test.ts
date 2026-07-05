import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OTA_UPDATE_CHECK_THROTTLE_MS,
  shouldRunOtaUpdateCheck,
} from '@/features/home/utils/otaUpdatePrompt';

// The foreground OTA check is throttled to once per hour (raised from 15m) so the
// check + bundle fetch samples far less often.
test('OTA foreground check is throttled to once per hour', () => {
  assert.equal(OTA_UPDATE_CHECK_THROTTLE_MS, 60 * 60 * 1000);
});

test('a check just inside the throttle window is suppressed; just outside is allowed', () => {
  const now = 10_000_000;
  const baseInput = {
    isDev: false,
    isUpdatesEnabled: true,
    isRunActive: false,
    nowMs: now,
  };

  // 59 minutes since last check → still throttled.
  assert.equal(
    shouldRunOtaUpdateCheck({ ...baseInput, lastCheckAtMs: now - 59 * 60 * 1000 }),
    false,
  );

  // 61 minutes since last check → allowed.
  assert.equal(
    shouldRunOtaUpdateCheck({ ...baseInput, lastCheckAtMs: now - 61 * 60 * 1000 }),
    true,
  );
});
