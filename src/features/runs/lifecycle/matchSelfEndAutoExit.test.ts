import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LOCAL_GOAL_FREEZE_AUTO_EXIT_GRACE_MS,
  resolveSelfEndAutoExit,
} from './matchSelfEndAutoExit';

const T0 = Date.parse('2026-07-09T00:35:00.000Z');

function input(overrides?: Partial<Parameters<typeof resolveSelfEndAutoExit>[0]>) {
  return {
    source: 'duel' as const,
    matchId: 'match-1',
    isTestMatch: false,
    selfFinished: false,
    selfForfeited: false,
    isLeaving: false,
    isSaving: false,
    saveInFlight: false,
    trackingStatus: 'running',
    alreadyDispatchedMatchId: null,
    freezeCrossedAtMs: null,
    nowMs: T0,
    ...overrides,
  };
}

test('self-finished echo dispatches the auto exit', () => {
  assert.equal(resolveSelfEndAutoExit(input({ selfFinished: true })), 'self-finished');
});

test('self-forfeited echo dispatches its own handler and wins over self-finished', () => {
  assert.equal(resolveSelfEndAutoExit(input({ selfForfeited: true })), 'self-forfeited');
  assert.equal(
    resolveSelfEndAutoExit(input({ selfForfeited: true, selfFinished: true })),
    'self-forfeited',
  );
});

test('no source / no matchId / test match never dispatches', () => {
  assert.equal(resolveSelfEndAutoExit(input({ selfFinished: true, source: null })), null);
  assert.equal(resolveSelfEndAutoExit(input({ selfFinished: true, matchId: null })), null);
  assert.equal(resolveSelfEndAutoExit(input({ selfFinished: true, isTestMatch: true })), null);
});

test('one-shot bug fix: a save-blocked tick SKIPS without consuming the once-latch', () => {
  // The old card latched BEFORE the handler ran; the handler early-returned on isSaving and
  // auto-exit was permanently dead for the mount. Now the blocked tick returns null (caller
  // does not latch)...
  assert.equal(resolveSelfEndAutoExit(input({ selfFinished: true, isSaving: true })), null);
  assert.equal(resolveSelfEndAutoExit(input({ selfFinished: true, isLeaving: true })), null);
  assert.equal(resolveSelfEndAutoExit(input({ selfFinished: true, saveInFlight: true })), null);

  // ...and the next tick, once the save settled, retries and dispatches.
  assert.equal(resolveSelfEndAutoExit(input({ selfFinished: true })), 'self-finished');
});

test('once per matchId: a dispatched match never re-fires, a NEW match re-arms', () => {
  assert.equal(
    resolveSelfEndAutoExit(input({ selfFinished: true, alreadyDispatchedMatchId: 'match-1' })),
    null,
  );
  assert.equal(
    resolveSelfEndAutoExit(input({ selfFinished: true, alreadyDispatchedMatchId: 'match-0' })),
    'self-finished',
  );
});

test('freeze deadline: a recorded crossing with no terminal echo forces the exit after the grace', () => {
  const crossedAt = T0 - LOCAL_GOAL_FREEZE_AUTO_EXIT_GRACE_MS;
  assert.equal(
    resolveSelfEndAutoExit(input({ freezeCrossedAtMs: crossedAt })),
    'freeze-deadline',
  );

  // Inside the grace the server echo still gets its chance (no dispatch yet).
  assert.equal(
    resolveSelfEndAutoExit(input({ freezeCrossedAtMs: crossedAt + 1_000 })),
    null,
  );
});

test('freeze deadline fires ONLY while the tracker is actively running (excludes countdown/paused/saving)', () => {
  const crossedAt = T0 - LOCAL_GOAL_FREEZE_AUTO_EXIT_GRACE_MS - 1_000;
  for (const trackingStatus of ['idle', 'starting', 'paused', 'saving']) {
    assert.equal(
      resolveSelfEndAutoExit(input({ freezeCrossedAtMs: crossedAt, trackingStatus })),
      null,
      `must not fire while tracking status is '${trackingStatus}'`,
    );
  }
  assert.equal(
    resolveSelfEndAutoExit(input({ freezeCrossedAtMs: crossedAt, trackingStatus: 'running' })),
    'freeze-deadline',
  );
});

test('freeze deadline respects the single-flight and once-latch guards too', () => {
  const crossedAt = T0 - LOCAL_GOAL_FREEZE_AUTO_EXIT_GRACE_MS - 1_000;
  assert.equal(
    resolveSelfEndAutoExit(input({ freezeCrossedAtMs: crossedAt, saveInFlight: true })),
    null,
  );
  assert.equal(
    resolveSelfEndAutoExit(input({ freezeCrossedAtMs: crossedAt, alreadyDispatchedMatchId: 'match-1' })),
    null,
  );
});

test('no freeze and no echo: nothing dispatches (the run keeps going)', () => {
  assert.equal(resolveSelfEndAutoExit(input()), null);
});
