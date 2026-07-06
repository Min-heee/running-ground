import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveCompetitiveMotionGate,
  shouldRequestCompetitiveMotionPermission,
} from './competitiveMotionGateModel';

test('already-granted permission passes straight through', () => {
  assert.deepEqual(
    resolveCompetitiveMotionGate({ available: true, canAsk: true, granted: true }),
    { ok: true },
  );
  // canAsk is irrelevant once granted (iOS reports canAskAgain false after granting too).
  assert.deepEqual(
    resolveCompetitiveMotionGate({ available: true, canAsk: false, granted: true }),
    { ok: true },
  );
});

test('a granted in-gate request passes', () => {
  assert.deepEqual(
    resolveCompetitiveMotionGate({
      available: true,
      canAsk: true,
      granted: false,
      requestGranted: true,
    }),
    { ok: true },
  );
});

test('no step sensor classifies as unavailable', () => {
  assert.deepEqual(
    resolveCompetitiveMotionGate({ available: false, canAsk: false, granted: false }),
    { ok: false, reason: 'unavailable' },
  );
});

test('hard-denied (OS will not re-prompt) routes to Settings', () => {
  assert.deepEqual(
    resolveCompetitiveMotionGate({ available: true, canAsk: false, granted: false }),
    { ok: false, reason: 'denied-settings' },
  );
});

test('failed request that is still re-askable stays denied-can-ask', () => {
  // e.g. Android dialog dismissed via back — a fresh read says the OS will prompt again.
  assert.deepEqual(
    resolveCompetitiveMotionGate({
      available: true,
      canAsk: true,
      canAskAfterRequest: true,
      granted: false,
      requestGranted: false,
    }),
    { ok: false, reason: 'denied-can-ask' },
  );
});

test('failed request that locked further prompts routes to Settings', () => {
  // e.g. iOS: the first explicit deny flips canAskAgain to false.
  assert.deepEqual(
    resolveCompetitiveMotionGate({
      available: true,
      canAsk: true,
      canAskAfterRequest: false,
      granted: false,
      requestGranted: false,
    }),
    { ok: false, reason: 'denied-settings' },
  );
});

test('failed request without a fresh re-read defaults to the safe Settings route', () => {
  assert.deepEqual(
    resolveCompetitiveMotionGate({
      available: true,
      canAsk: true,
      granted: false,
      requestGranted: false,
    }),
    { ok: false, reason: 'denied-settings' },
  );
});

test('promptable-but-never-requested stays denied-can-ask', () => {
  // Unreachable via ensureCompetitiveMotionPermission (it always requests when askable), but the
  // truthful classification: no dialog was fired, so the next attempt still can.
  assert.deepEqual(
    resolveCompetitiveMotionGate({ available: true, canAsk: true, granted: false }),
    { ok: false, reason: 'denied-can-ask' },
  );
});

test('the OS dialog fires only when not granted, sensor present, and still askable', () => {
  assert.equal(
    shouldRequestCompetitiveMotionPermission({ available: true, canAsk: true, granted: false }),
    true,
  );
  assert.equal(
    shouldRequestCompetitiveMotionPermission({ available: true, canAsk: true, granted: true }),
    false,
  );
  assert.equal(
    shouldRequestCompetitiveMotionPermission({ available: false, canAsk: false, granted: false }),
    false,
  );
  assert.equal(
    shouldRequestCompetitiveMotionPermission({ available: true, canAsk: false, granted: false }),
    false,
  );
});
