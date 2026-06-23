import assert from 'node:assert/strict';
import test from 'node:test';

import { isPartyRunForSave, resolveMatchSaveSource } from './partyRunSourceClassifier';
import type { RoomLinkedMatchContext } from './matchExitFlow';

const groupRoomContext: RoomLinkedMatchContext = {
  mode: 'group',
  matchId: 'match-group-1',
};

const duelRoomContext: RoomLinkedMatchContext = {
  mode: 'duel',
  matchId: 'match-duel-1',
};

test('an early-forfeited party run saves as party even when the live room context is already null', () => {
  // Reproduces the bug: a group party run reached a live state (so the latch was set), then
  // the user forfeits immediately. By the time the save runs, the ephemeral
  // roomLinkedMatchContext has already dropped to null (room torn down) — but the latch holds.
  assert.equal(isPartyRunForSave({ wasPartyRun: true, roomLinkedMatchContext: null }), true);
  assert.equal(resolveMatchSaveSource({ wasPartyRun: true, roomLinkedMatchContext: null }), 'party');
});

test('a party run with a still-live room context saves as party', () => {
  assert.equal(
    resolveMatchSaveSource({ wasPartyRun: true, roomLinkedMatchContext: groupRoomContext }),
    'party',
  );
  // Latch not yet set but context present (first render) — still party.
  assert.equal(
    resolveMatchSaveSource({ wasPartyRun: false, roomLinkedMatchContext: duelRoomContext }),
    'party',
  );
});

test('an official matchmaking match stays official: it never sets the latch nor a room context', () => {
  // A matchmaking match never populates a RunningMatchRoom, so both signals are falsy and the
  // run is classified official — no ranked-label / LP leak risk for party runs, and no
  // mis-tagging of real official matches as party.
  assert.equal(isPartyRunForSave({ wasPartyRun: false, roomLinkedMatchContext: null }), false);
  assert.equal(resolveMatchSaveSource({ wasPartyRun: false, roomLinkedMatchContext: null }), 'official');
});

test('latch reset prevents an official match #2 from inheriting party run #1 classification', () => {
  // After the post-run runtime reset, wasPartyRunRef is false again; the next official match
  // (no room context) classifies official.
  const afterReset = resolveMatchSaveSource({ wasPartyRun: false, roomLinkedMatchContext: null });
  assert.equal(afterReset, 'official');
});
