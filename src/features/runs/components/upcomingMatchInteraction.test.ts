import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveUpcomingMatchInteraction } from './upcomingMatchInteraction';

test('matched duel far from start opens the reservation room (tappable, no arena)', () => {
  const interaction = resolveUpcomingMatchInteraction(
    { mode: 'duel', status: 'matched' },
    5 * 60, // 5 minutes out — well outside the ≤20s arena window
  );

  assert.equal(interaction.opensReservationRoom, true);
  assert.equal(interaction.canOpenArena, false);
  assert.equal(interaction.isTappable, true);
});

test('matched duel inside the arena window hands off to the arena (no reservation room)', () => {
  const interaction = resolveUpcomingMatchInteraction(
    { mode: 'duel', status: 'matched' },
    15, // ≤20s — arena auto-open owns it
  );

  assert.equal(interaction.canOpenArena, true);
  assert.equal(interaction.opensReservationRoom, false);
  assert.equal(interaction.isTappable, true);
});

test('active duel opens the arena, never the reservation room', () => {
  const interaction = resolveUpcomingMatchInteraction(
    { mode: 'duel', status: 'active' },
    null,
  );

  assert.equal(interaction.canOpenArena, true);
  assert.equal(interaction.opensReservationRoom, false);
  assert.equal(interaction.isTappable, true);
});

test('matched group keeps existing behavior: not tappable until the arena window', () => {
  const farOut = resolveUpcomingMatchInteraction(
    { mode: 'group', status: 'matched' },
    5 * 60,
  );
  assert.equal(farOut.opensReservationRoom, false);
  assert.equal(farOut.canOpenArena, false);
  assert.equal(farOut.isTappable, false);

  const nearStart = resolveUpcomingMatchInteraction(
    { mode: 'group', status: 'matched' },
    10,
  );
  assert.equal(nearStart.opensReservationRoom, false);
  assert.equal(nearStart.canOpenArena, true);
  assert.equal(nearStart.isTappable, true);
});
