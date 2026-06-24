import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isWithinReservationArenaHandoffWindow,
  resolveReservationArenaHandoff,
} from './reservationArenaHandoff';

const baseInput = {
  mode: 'duel' as const,
  matchId: 'match-1',
  distanceKm: 5,
  slotStartAt: '2026-06-25T11:00:00.000Z',
  isTestMatch: false,
};

test('window: true only for 0 < remaining <= 25s', () => {
  assert.equal(isWithinReservationArenaHandoffWindow(25), true);
  assert.equal(isWithinReservationArenaHandoffWindow(20), true);
  assert.equal(isWithinReservationArenaHandoffWindow(1), true);
  assert.equal(isWithinReservationArenaHandoffWindow(26), false);
  assert.equal(isWithinReservationArenaHandoffWindow(5 * 60), false);
  assert.equal(isWithinReservationArenaHandoffWindow(0), false);
  assert.equal(isWithinReservationArenaHandoffWindow(-3), false);
  assert.equal(isWithinReservationArenaHandoffWindow(null), false);
});

test('matched duel inside the handoff window hands off with arena-focus params', () => {
  const decision = resolveReservationArenaHandoff({ ...baseInput, remainingSeconds: 24 });

  assert.equal(decision.shouldHandOff, true);
  assert.ok(decision.focusParams);
  assert.equal(decision.focusParams?.focusMatchMode, 'duel');
  assert.equal(decision.focusParams?.focusMatchId, 'match-1');
  assert.equal(decision.focusParams?.focusMatchDistanceKm, '5');
  assert.equal(decision.focusParams?.focusMatchSlotStartAt, '2026-06-25T11:00:00.000Z');
  assert.equal(decision.focusParams?.focusMatchIsTest, '0');
  // forceMatchArena drives focusRunningMatch({ preferArena: true }) so the arena mounts
  // under the overlay — the no-0-second-transition guarantee.
  assert.equal(decision.focusParams?.forceMatchArena, '1');
});

test('handoff fires a few seconds BEFORE the runtime ≤20s arena window (buffer)', () => {
  // 25s and 21s are both in the buffer zone above the ≤20s arena-open window.
  assert.equal(resolveReservationArenaHandoff({ ...baseInput, remainingSeconds: 25 }).shouldHandOff, true);
  assert.equal(resolveReservationArenaHandoff({ ...baseInput, remainingSeconds: 21 }).shouldHandOff, true);
});

test('does NOT hand off while viewing a far-future reservation', () => {
  const decision = resolveReservationArenaHandoff({ ...baseInput, remainingSeconds: 5 * 60 });
  assert.equal(decision.shouldHandOff, false);
  assert.equal(decision.focusParams, null);
});

test('does NOT hand off once the slot has fired (remaining === null)', () => {
  // After the slot fires the running tab's own active/route hydration owns it.
  const decision = resolveReservationArenaHandoff({ ...baseInput, remainingSeconds: null });
  assert.equal(decision.shouldHandOff, false);
  assert.equal(decision.focusParams, null);
});

test('does NOT hand off without a matchId', () => {
  const decision = resolveReservationArenaHandoff({ ...baseInput, matchId: null, remainingSeconds: 15 });
  assert.equal(decision.shouldHandOff, false);
  assert.equal(decision.focusParams, null);
});

test('group reservation mirrors duel: hands off with mode=group', () => {
  const decision = resolveReservationArenaHandoff({
    ...baseInput,
    mode: 'group',
    remainingSeconds: 22,
  });

  assert.equal(decision.shouldHandOff, true);
  assert.equal(decision.focusParams?.focusMatchMode, 'group');
  assert.equal(decision.focusParams?.forceMatchArena, '1');
});

test('test-match reservation carries focusMatchIsTest=1', () => {
  const decision = resolveReservationArenaHandoff({
    ...baseInput,
    isTestMatch: true,
    remainingSeconds: 18,
  });

  assert.equal(decision.shouldHandOff, true);
  assert.equal(decision.focusParams?.focusMatchIsTest, '1');
});

test('omits distance param when distanceKm is not a finite number', () => {
  const decision = resolveReservationArenaHandoff({
    ...baseInput,
    distanceKm: null,
    remainingSeconds: 10,
  });

  assert.equal(decision.shouldHandOff, true);
  assert.equal(decision.focusParams?.focusMatchDistanceKm, undefined);
});
