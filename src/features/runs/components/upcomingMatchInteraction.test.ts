import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveUpcomingMatchInteraction } from './upcomingMatchInteraction';

test('matched duel far from start opens the reservation room (tappable, no arena)', () => {
  const interaction = resolveUpcomingMatchInteraction(
    { mode: 'duel', status: 'matched' },
    5 * 60, // 5 minutes out — well outside the ≤20s arena window
  );

  assert.equal(interaction.opensReservationRoom, true);
  assert.equal(interaction.reservationRoomMode, 'duel');
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

test('matched group far from start opens the group reservation room (mirrors duel)', () => {
  const interaction = resolveUpcomingMatchInteraction(
    { mode: 'group', status: 'matched' },
    5 * 60, // 5 minutes out — well outside the ≤20s arena window
  );

  assert.equal(interaction.opensReservationRoom, true);
  assert.equal(interaction.reservationRoomMode, 'group');
  assert.equal(interaction.canOpenArena, false);
  assert.equal(interaction.isTappable, true);
});

test('matched group inside the arena window hands off to the arena (no reservation room)', () => {
  const interaction = resolveUpcomingMatchInteraction(
    { mode: 'group', status: 'matched' },
    10, // ≤20s — arena auto-open owns it for groups too
  );

  assert.equal(interaction.opensReservationRoom, false);
  assert.equal(interaction.reservationRoomMode, null);
  assert.equal(interaction.canOpenArena, true);
  assert.equal(interaction.isTappable, true);
});

test('active group opens the arena, never the reservation room', () => {
  const interaction = resolveUpcomingMatchInteraction(
    { mode: 'group', status: 'active' },
    null,
  );

  assert.equal(interaction.opensReservationRoom, false);
  assert.equal(interaction.reservationRoomMode, null);
  assert.equal(interaction.canOpenArena, true);
  assert.equal(interaction.isTappable, true);
});

// 파티런 예약 (오너 2026-09-09): roomId가 붙은 매치는 공식 예약 대기실이 아니라 파티런 대기방으로.
test('matched party-run item (roomId) far from start opens the party room, not the reservation room', () => {
  const interaction = resolveUpcomingMatchInteraction(
    { mode: 'duel', status: 'matched', roomId: 'room-1' },
    3 * 60 * 60,
  );

  assert.equal(interaction.opensPartyRoom, true);
  assert.equal(interaction.opensReservationRoom, false);
  assert.equal(interaction.reservationRoomMode, null);
  assert.equal(interaction.canOpenArena, false);
  assert.equal(interaction.isTappable, true);
});

test('party-run group items route to the party room too, and the arena window still wins', () => {
  const far = resolveUpcomingMatchInteraction({ mode: 'group', status: 'matched', roomId: 'room-2' }, 600);
  assert.equal(far.opensPartyRoom, true);
  assert.equal(far.opensReservationRoom, false);

  const near = resolveUpcomingMatchInteraction({ mode: 'group', status: 'matched', roomId: 'room-2' }, 15);
  assert.equal(near.opensPartyRoom, false);
  assert.equal(near.canOpenArena, true);
  assert.equal(near.isTappable, true);

  const active = resolveUpcomingMatchInteraction({ mode: 'duel', status: 'active', roomId: 'room-2' }, null);
  assert.equal(active.opensPartyRoom, false);
  assert.equal(active.canOpenArena, true);
});

test('an empty/whitespace roomId is not a party run', () => {
  const interaction = resolveUpcomingMatchInteraction({ mode: 'duel', status: 'matched', roomId: '  ' }, 600);
  assert.equal(interaction.opensPartyRoom, false);
  assert.equal(interaction.opensReservationRoom, true);
});
