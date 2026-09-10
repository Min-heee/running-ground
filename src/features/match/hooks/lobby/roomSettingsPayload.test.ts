import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRoomSettingsPayload } from './roomSettingsPayload';

const hostRoom = {
  roomId: 'room-1',
  mode: 'duel' as const,
  distanceKm: 5,
  startMode: 'host' as const,
  slotStartAt: '2026-09-09T01:23:45.000Z',
  maxParticipants: 2,
};

const scheduledRoom = {
  ...hostRoom,
  startMode: 'scheduled' as const,
  slotStartAt: '2026-09-10T02:00:00.000Z',
};

test('a distance-only save on a scheduled room keeps startMode + slotStartAt (no silent host revert)', () => {
  const payload = buildRoomSettingsPayload({
    room: scheduledRoom,
    overrides: { distanceKm: 10 },
    selectedFriendIds: ['friend-1'],
  });

  assert.equal(payload.startMode, 'scheduled');
  assert.equal(payload.slotStartAt, '2026-09-10T02:00:00.000Z');
  assert.equal(payload.distanceKm, 10);
  assert.deepEqual(payload.invitedFriendIds, ['friend-1']);
});

test('a host-start room never sends slotStartAt (the server stamps now for host mode)', () => {
  const payload = buildRoomSettingsPayload({
    room: hostRoom,
    selectedFriendIds: [],
  });

  assert.equal(payload.startMode, 'host');
  assert.equal('slotStartAt' in payload, false);
});

test('switching to scheduled carries the chosen slot; switching back to host drops it', () => {
  const toScheduled = buildRoomSettingsPayload({
    room: hostRoom,
    overrides: { startMode: 'scheduled', slotStartAt: '2026-09-11T09:00:00.000Z' },
    selectedFriendIds: [],
  });
  assert.equal(toScheduled.startMode, 'scheduled');
  assert.equal(toScheduled.slotStartAt, '2026-09-11T09:00:00.000Z');

  const toHost = buildRoomSettingsPayload({
    room: scheduledRoom,
    overrides: { startMode: 'host' },
    selectedFriendIds: [],
  });
  assert.equal(toHost.startMode, 'host');
  assert.equal('slotStartAt' in toHost, false);
});

test('duel rooms pin maxParticipants to 2, group rooms honor the override', () => {
  assert.equal(buildRoomSettingsPayload({ room: hostRoom, selectedFriendIds: [] }).maxParticipants, 2);
  assert.equal(buildRoomSettingsPayload({
    room: { ...hostRoom, mode: 'group', maxParticipants: 10 },
    overrides: { maxParticipants: 6 },
    selectedFriendIds: [],
  }).maxParticipants, 6);
});
