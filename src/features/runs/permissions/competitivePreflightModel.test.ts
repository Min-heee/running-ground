import assert from 'node:assert/strict';
import test from 'node:test';
import {
  combineCompetitivePreflight,
  resolveCompetitiveLocationGate,
  shouldRequestCompetitiveBatteryExemption,
  shouldRequestCompetitiveNotifications,
} from './competitivePreflightModel';

// --- location gate -------------------------------------------------------------------------------

test('location fast path: foreground + background(=always) already granted passes with no requests', () => {
  assert.deepEqual(
    resolveCompetitiveLocationGate({
      backgroundCanAsk: true,
      backgroundGranted: true,
      foregroundGranted: true,
    }),
    { ok: true },
  );
  // canAsk is irrelevant once granted (iOS reports canAskAgain false after granting too).
  assert.deepEqual(
    resolveCompetitiveLocationGate({
      backgroundCanAsk: false,
      backgroundGranted: true,
      foregroundGranted: true,
    }),
    { ok: true },
  );
});

test('foreground denied blocks as foreground-denied (background never reached)', () => {
  // Dialog fired and denied/dismissed.
  assert.deepEqual(
    resolveCompetitiveLocationGate({
      backgroundCanAsk: true,
      backgroundGranted: false,
      foregroundGranted: false,
      requestedForeground: false,
    }),
    { ok: false, reason: 'foreground-denied' },
  );
  // Not granted and no dialog fired (hard-denied → request no-ops): same terminal reason.
  assert.deepEqual(
    resolveCompetitiveLocationGate({
      backgroundCanAsk: false,
      backgroundGranted: false,
      foregroundGranted: false,
    }),
    { ok: false, reason: 'foreground-denied' },
  );
});

test('foreground granted in-gate then background granted via request passes', () => {
  assert.deepEqual(
    resolveCompetitiveLocationGate({
      backgroundCanAsk: true,
      backgroundGranted: false,
      disclosureAccepted: true,
      foregroundGranted: false,
      requestedBackground: true,
      requestedForeground: true,
    }),
    { ok: true },
  );
});

test('background granted only on the fresh re-read (settings route / provisional) still passes', () => {
  // e.g. Android 11+ routes the request to Settings and the request result under-reports.
  assert.deepEqual(
    resolveCompetitiveLocationGate({
      backgroundAfterRequest: true,
      backgroundCanAsk: true,
      backgroundGranted: false,
      disclosureAccepted: true,
      foregroundGranted: true,
      requestedBackground: false,
    }),
    { ok: true },
  );
});

test('disclosure declined blocks as background-declined (the silent block)', () => {
  assert.deepEqual(
    resolveCompetitiveLocationGate({
      backgroundCanAsk: true,
      backgroundGranted: false,
      disclosureAccepted: false,
      foregroundGranted: true,
    }),
    { ok: false, reason: 'background-declined' },
  );
});

test('disclosure accepted but OS-locked background prompt routes to background-request-locked', () => {
  // requestBackgroundLocation() would silently no-op — the wiring opens Settings directly.
  assert.deepEqual(
    resolveCompetitiveLocationGate({
      backgroundCanAsk: false,
      backgroundGranted: false,
      disclosureAccepted: true,
      foregroundGranted: true,
    }),
    { ok: false, reason: 'background-request-locked' },
  );
});

test('background still not always after the disclosure-approved attempt blocks as background-denied', () => {
  assert.deepEqual(
    resolveCompetitiveLocationGate({
      backgroundAfterRequest: false,
      backgroundCanAsk: true,
      backgroundGranted: false,
      disclosureAccepted: true,
      foregroundGranted: true,
      requestedBackground: false,
    }),
    { ok: false, reason: 'background-denied' },
  );
});

// --- soft steps ------------------------------------------------------------------------------------

test('notifications soft ask fires only when not granted, askable, and not yet asked this session', () => {
  assert.equal(
    shouldRequestCompetitiveNotifications({
      canAsk: true,
      granted: false,
      requestedThisSession: false,
    }),
    true,
  );
  assert.equal(
    shouldRequestCompetitiveNotifications({
      canAsk: true,
      granted: true,
      requestedThisSession: false,
    }),
    false,
  );
  assert.equal(
    shouldRequestCompetitiveNotifications({
      canAsk: false,
      granted: false,
      requestedThisSession: false,
    }),
    false,
  );
  assert.equal(
    shouldRequestCompetitiveNotifications({
      canAsk: true,
      granted: false,
      requestedThisSession: true,
    }),
    false,
  );
});

test('battery exemption soft ask fires only when available, not exempt, and not yet asked this session', () => {
  assert.equal(
    shouldRequestCompetitiveBatteryExemption({
      available: true,
      exempt: false,
      requestedThisSession: false,
    }),
    true,
  );
  // iOS / old Android binary: native control unavailable.
  assert.equal(
    shouldRequestCompetitiveBatteryExemption({
      available: false,
      exempt: false,
      requestedThisSession: false,
    }),
    false,
  );
  assert.equal(
    shouldRequestCompetitiveBatteryExemption({
      available: true,
      exempt: true,
      requestedThisSession: false,
    }),
    false,
  );
  assert.equal(
    shouldRequestCompetitiveBatteryExemption({
      available: true,
      exempt: false,
      requestedThisSession: true,
    }),
    false,
  );
});

// --- overall combinator -----------------------------------------------------------------------------

test('soft denials never block: notifications denied + battery not exempt still resolves ok', () => {
  assert.deepEqual(
    combineCompetitivePreflight({
      batteryExempt: false,
      location: { ok: true },
      motion: { ok: true },
      notificationsGranted: false,
    }),
    { ok: true },
  );
});

test('a location block wins and carries its reason', () => {
  assert.deepEqual(
    combineCompetitivePreflight({
      batteryExempt: true,
      location: { ok: false, reason: 'background-denied' },
      motion: null,
      notificationsGranted: true,
    }),
    { block: { kind: 'location', reason: 'background-denied' }, ok: false },
  );
});

test('a motion block after a passing location gate carries its reason', () => {
  assert.deepEqual(
    combineCompetitivePreflight({
      batteryExempt: true,
      location: { ok: true },
      motion: { ok: false, reason: 'denied-settings' },
      notificationsGranted: true,
    }),
    { block: { kind: 'motion', reason: 'denied-settings' }, ok: false },
  );
});
