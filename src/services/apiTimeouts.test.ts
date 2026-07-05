import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_API_TIMEOUT_MS,
  LIVE_MATCH_REQUEST_TIMEOUT_MS,
  TRACKED_RUN_SAVE_TIMEOUT_MS,
} from '@/services/apiTimeouts';

test('the tracked-run save timeout is well above the default (slow 1vCPU write finishes once)', () => {
  assert.equal(TRACKED_RUN_SAVE_TIMEOUT_MS, 60000);
  assert.ok(
    TRACKED_RUN_SAVE_TIMEOUT_MS > DEFAULT_API_TIMEOUT_MS,
    'tracked-run save must allow more than the default request timeout',
  );
});

test('the live-match timeout stays tight (below the default)', () => {
  assert.ok(LIVE_MATCH_REQUEST_TIMEOUT_MS < DEFAULT_API_TIMEOUT_MS);
});
