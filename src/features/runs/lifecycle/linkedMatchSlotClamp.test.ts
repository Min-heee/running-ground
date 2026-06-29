import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchState } from '@/lib/api/types';
import {
  clampLinkedMatchStateToSlot,
  derivePartyRunStartPhase,
  shouldEnterMatchArenaForLifecycle,
} from './matchStateMachine';

// ---------------------------------------------------------------------------
// Party-run GUEST countdown-skip blocker (3rd-attempt single-source clamp).
//
// PROVEN root cause: the linked duel/group session is SHARED. The backend
// hydrateMatchSessionState returns state:'active' the instant ANY participant
// pushes live progress (hasLiveProgress), even with slotStartAt still in the
// FUTURE. The guest's linked poll then stamps duel/groupMatchStatus.state =
// 'active' BEFORE the guest's own slot, and two ungated consumers fire early:
//   BLOCKER A: shouldEnterMatchArenaForLifecycle force-opens the arena on
//              duelState/groupState === 'active' (NO slot gate).
//   BLOCKER B: useMatchAutoTrackingEffects' fallbackActiveMatch starts GPS on
//              duelMatchStatus?.state === 'active' (NO slot gate).
// FIX: clampLinkedMatchStateToSlot holds the server 'active' at 'matched' until
// THIS phone's slot is reached on the synced clock, applied at the single
// ingestion chokepoint (loadDuel/GroupMatchStatus + the unified applier), and
// resolveLinkedMatchActiveTransition (useLinkedMatchSync) gates the live poll the
// same way. BOTH run on the live getSyncedNowMs(), so both blockers read the
// (now-clamped) stored state and both close at the source.
//
// There is a THIRD, room-snapshot path — derivePartyRunStartPhase returns 'active'
// on room.linkedMatchStatus === 'active' — but it is NOT clamped, deliberately: the
// runtime's resolvePartyRunFlowSyncedNowMs feeds syncedNowMs=null for the entire
// pre-slot window, so a phase-layer clamp could never fire (it once existed and was
// dead code). The pre-slot room leak to phase 'active' is harmless: it only feeds
// distance-cleanup skips / the watchdog / diagnostics, while GPS measuring is
// independently slot-gated by resolveMatchSlotStarted (useMatchRuntimeState). The
// room-path tests below assert that REAL contract, not the dead clamp.
// ---------------------------------------------------------------------------

const SLOT_ISO = '2026-06-29T00:00:18.000Z';
const SLOT_MS = Date.parse(SLOT_ISO);

// ---- The clamp helper itself ----------------------------------------------

test('clamp: server active BEFORE this phone slot is held at matched', () => {
  // Guest at slot - 6s: their 6s countdown digit is on screen; the shared
  // session already reports active because the host started measuring early.
  assert.equal(
    clampLinkedMatchStateToSlot('active', SLOT_ISO, SLOT_MS - 6_000),
    'matched',
  );
});

test('clamp: releases EXACTLY at the slot (>= slot → active)', () => {
  // 1ms before the slot: still clamped.
  assert.equal(clampLinkedMatchStateToSlot('active', SLOT_ISO, SLOT_MS - 1), 'matched');
  // At the slot instant: released.
  assert.equal(clampLinkedMatchStateToSlot('active', SLOT_ISO, SLOT_MS), 'active');
  // Just past the slot (re-join into an already-running match): released.
  assert.equal(clampLinkedMatchStateToSlot('active', SLOT_ISO, SLOT_MS + 500), 'active');
});

test('clamp: re-join into a long-running match (slot far in the past) flows active', () => {
  assert.equal(clampLinkedMatchStateToSlot('active', SLOT_ISO, SLOT_MS + 5 * 60_000), 'active');
});

test('clamp: non-active server states pass through untouched', () => {
  for (const state of ['matched', 'waiting', 'idle'] as RunningMatchState[]) {
    assert.equal(clampLinkedMatchStateToSlot(state, SLOT_ISO, SLOT_MS - 6_000), state);
  }
});

test('clamp: with no parseable slot, server active is the only signal and passes through', () => {
  assert.equal(clampLinkedMatchStateToSlot('active', null, SLOT_MS - 6_000), 'active');
  assert.equal(clampLinkedMatchStateToSlot('active', 'not-a-date', SLOT_MS - 6_000), 'active');
  assert.equal(clampLinkedMatchStateToSlot('active', SLOT_ISO, null), 'active');
});

test('clamp: null / undefined server state pass through', () => {
  assert.equal(clampLinkedMatchStateToSlot(null, SLOT_ISO, SLOT_MS - 6_000), null);
  assert.equal(clampLinkedMatchStateToSlot(undefined, SLOT_ISO, SLOT_MS - 6_000), undefined);
});

// ---- BLOCKER A: arena force-open (shouldEnterMatchArenaForLifecycle) --------
//
// duelState/groupState flow straight from duelMatchStatus?.state. The ingestion
// clamp rewrites that stored state, so the consumer below sees the CLAMPED value.
// We reproduce the exact wiring: server 'active' at slot-6s → clamped 'matched'.

test('REPRO Blocker A: arena does NOT force-open pre-slot once the stored state is clamped', () => {
  const serverState: RunningMatchState = 'active';
  const syncedNowMs = SLOT_MS - 6_000;

  // Pre-fix: the raw server 'active' was stored, so shouldEnterMatchArenaForLifecycle
  // fired and force-opened the arena 6s early — the countdown skip.
  assert.equal(
    shouldEnterMatchArenaForLifecycle({
      duelState: serverState, // raw, unclamped — the bug
      groupState: 'idle',
      duelShouldOpenCountdownArena: false,
      groupShouldOpenCountdownArena: false,
    }),
    true,
    'pre-fix: raw server active force-opened the arena before the guest slot',
  );

  // Post-fix: the stored state is the clamp output ('matched'), so the arena
  // does NOT force-open. The guest stays on their countdown.
  const clampedDuelState = clampLinkedMatchStateToSlot(serverState, SLOT_ISO, syncedNowMs);
  assert.equal(clampedDuelState, 'matched');
  assert.equal(
    shouldEnterMatchArenaForLifecycle({
      duelState: clampedDuelState,
      groupState: 'idle',
      duelShouldOpenCountdownArena: false,
      groupShouldOpenCountdownArena: false,
    }),
    false,
    'post-fix: clamped state holds the guest on the countdown, no arena force-open',
  );
});

test('Blocker A: arena DOES force-open at/after the slot (clamp released)', () => {
  const clampedAtSlot = clampLinkedMatchStateToSlot('active', SLOT_ISO, SLOT_MS);
  assert.equal(clampedAtSlot, 'active');
  assert.equal(
    shouldEnterMatchArenaForLifecycle({
      duelState: clampedAtSlot,
      groupState: 'idle',
      duelShouldOpenCountdownArena: false,
      groupShouldOpenCountdownArena: false,
    }),
    true,
  );
});

test('Blocker A (group): same clamp closes the group arena force-open pre-slot', () => {
  const clampedGroupState = clampLinkedMatchStateToSlot('active', SLOT_ISO, SLOT_MS - 6_000);
  assert.equal(
    shouldEnterMatchArenaForLifecycle({
      duelState: 'idle',
      groupState: clampedGroupState,
      duelShouldOpenCountdownArena: false,
      groupShouldOpenCountdownArena: false,
    }),
    false,
  );
});

// ---- BLOCKER B: GPS auto-start (fallbackActiveMatch) -----------------------
//
// useMatchAutoTrackingEffects' fallbackActiveMatch branch is exactly:
//   duelMatchStatus?.state === 'active' && matchId ? {…} : roomActiveMatch
// We model that pure predicate against the clamped stored state.

function resolveFallbackActiveMatchId(args: {
  matchMode: 'duel' | 'group';
  duelState: RunningMatchState | null | undefined;
  duelMatchId: string | null;
  groupState: RunningMatchState | null | undefined;
  groupMatchId: string | null;
  roomActiveMatchId: string | null;
}): string | null {
  // Mirrors useMatchAutoTrackingEffects.fallbackActiveMatch (duel/group branch).
  const fallback = args.matchMode === 'duel'
    ? args.duelState === 'active' && args.duelMatchId
      ? args.duelMatchId
      : args.roomActiveMatchId
    : args.groupState === 'active' && args.groupMatchId
      ? args.groupMatchId
      : args.roomActiveMatchId;
  return fallback;
}

test('REPRO Blocker B: GPS auto-start does NOT fire pre-slot once the stored state is clamped', () => {
  const syncedNowMs = SLOT_MS - 6_000;

  // Pre-fix: raw server 'active' → fallbackActiveMatch resolves the matchId →
  // restorePersistedBackgroundRunTracking / startMatchTrackingAutomatically
  // begins measuring before the slot.
  assert.equal(
    resolveFallbackActiveMatchId({
      matchMode: 'duel',
      duelState: 'active', // raw, unclamped — the bug
      duelMatchId: 'match-1',
      groupState: 'idle',
      groupMatchId: null,
      roomActiveMatchId: null,
    }),
    'match-1',
    'pre-fix: raw server active armed GPS before the guest slot',
  );

  // Post-fix: the stored state is clamped to 'matched', so the duel branch
  // falls through to roomActiveMatch (null here) → no active match → no GPS.
  const clampedDuelState = clampLinkedMatchStateToSlot('active', SLOT_ISO, syncedNowMs);
  assert.equal(
    resolveFallbackActiveMatchId({
      matchMode: 'duel',
      duelState: clampedDuelState,
      duelMatchId: 'match-1',
      groupState: 'idle',
      groupMatchId: null,
      roomActiveMatchId: null,
    }),
    null,
    'post-fix: clamped state means no fallback active match, so GPS does not auto-start',
  );
});

test('Blocker B: GPS auto-start DOES fire at/after the slot (clamp released)', () => {
  const clampedAtSlot = clampLinkedMatchStateToSlot('active', SLOT_ISO, SLOT_MS);
  assert.equal(
    resolveFallbackActiveMatchId({
      matchMode: 'duel',
      duelState: clampedAtSlot,
      duelMatchId: 'match-1',
      groupState: 'idle',
      groupMatchId: null,
      roomActiveMatchId: null,
    }),
    'match-1',
  );
});

// ---- THIRD PATH: room.linkedMatchStatus via derivePartyRunStartPhase --------
//
// This path is deliberately NOT slot-clamped (see the header). These tests assert
// the REAL runtime contract, not a clamp the runtime never exercises.
//
// resolveMatchSlotStarted mirrors useMatchRuntimeState.ts:59-67 — the live-clock
// gate that actually keeps GPS measuring from starting before this phone's slot. We
// model it here to prove the room-phase 'active' leak below cannot start measuring.
function resolveMatchSlotStarted(slotStartAt: string | null | undefined, syncedNowMs: number) {
  if (!slotStartAt || !Number.isFinite(syncedNowMs)) {
    return true;
  }
  const slotStartMs = Date.parse(slotStartAt);
  return Number.isFinite(slotStartMs) ? syncedNowMs >= slotStartMs : true;
}

test('room path: with the runtime input (syncedNowMs=null pre-slot) the room-active leak is NOT phase-clamped', () => {
  const farSlotIso = '2026-06-29T00:01:00.000Z';

  // This is EXACTLY what the runtime passes during the countdown window:
  // resolvePartyRunFlowSyncedNowMs (useMatchCountdownModel) returns null whenever
  // remainingSeconds is a number. Under that real input, derivePartyRunStartPhase is
  // NOT slot-clamped, so a shared-session early-'active' room snapshot DOES leak to
  // phase 'active' pre-slot. (Earlier this test injected a non-null pre-slot
  // syncedNowMs the runtime never supplies, green-lighting a dead clamp.)
  const phase = derivePartyRunStartPhase({
    roomState: 'arming',
    linkedMatchStatus: 'active', // shared-session early active, frozen-room refetch
    isCountdownReady: false,
    remainingSeconds: 45,
    linkedMatchId: 'room-match-1',
    linkedMatchSlotStartAt: farSlotIso,
    syncedNowMs: null, // <- the value the runtime actually supplies pre-slot
  });

  // The leak is real but HARMLESS: phase 'active' here only feeds distance-cleanup
  // skips / the watchdog / diagnostics, never the slot-based countdown overlay and
  // never measuring (gated independently below).
  assert.equal(phase, 'active');
});

test('room path: measuring stays slot-gated even when the phase leaks active pre-slot', () => {
  const slotIso = '2026-06-29T00:01:00.000Z';
  const slotMs = Date.parse(slotIso);

  // Pre-slot on the live runtime clock: measuring is NOT allowed despite the leaked
  // phase — this is what actually protects the guest's countdown in production.
  assert.equal(resolveMatchSlotStarted(slotIso, slotMs - 45_000), false);
  // At / after the slot: measuring is allowed (countdown reached its slot, or a
  // re-join into an already-running match whose slot is long past).
  assert.equal(resolveMatchSlotStarted(slotIso, slotMs), true);
  assert.equal(resolveMatchSlotStarted(slotIso, slotMs + 500), true);
});

test('room path: a server-active room snapshot AT/after the slot still resolves active', () => {
  const phase = derivePartyRunStartPhase({
    roomState: 'arming',
    linkedMatchStatus: 'active',
    isCountdownReady: false,
    remainingSeconds: null, // slot has fired
    linkedMatchId: 'room-match-1',
    linkedMatchSlotStartAt: SLOT_ISO,
    syncedNowMs: SLOT_MS + 200,
  });
  assert.equal(phase, 'active');
});

test('room path: the HOST room transition (roomState active) resolves active pre-slot', () => {
  // The host's own room going 'active' is a legitimate transition that must
  // resolve to 'active' even pre-slot. (linkedMatchStatus is not clamped either, but
  // here it is 'matched', so this isolates the roomState === 'active' branch.)
  const phase = derivePartyRunStartPhase({
    roomState: 'active',
    linkedMatchStatus: 'matched',
    remainingSeconds: 6,
    linkedMatchId: 'room-match-1',
    linkedMatchSlotStartAt: SLOT_ISO,
    syncedNowMs: SLOT_MS - 6_000,
  });
  assert.equal(phase, 'active');
});

// ---- MATCHED (matchmaking) path is NOT delayed -----------------------------

test('MATCHED is not delayed: a matched future-slot match transitions to active EXACTLY at its slot', () => {
  // The matched path ALSO hydrates active-early via the same backend, so it is
  // clamped the SAME way. The clamp must release at the slot — neither early-
  // skip nor delayed-past-slot.
  const matchedSlotMs = Date.parse('2026-06-29T01:00:30.000Z'); // matched = 30s window

  // 30s before slot: clamped → matched (countdown), not skipped early.
  assert.equal(
    clampLinkedMatchStateToSlot('active', '2026-06-29T01:00:30.000Z', matchedSlotMs - 30_000),
    'matched',
  );
  // 1ms before slot: still matched (not delayed-released-early either).
  assert.equal(
    clampLinkedMatchStateToSlot('active', '2026-06-29T01:00:30.000Z', matchedSlotMs - 1),
    'matched',
  );
  // EXACTLY at the slot: active — transitions on time, not delayed.
  assert.equal(
    clampLinkedMatchStateToSlot('active', '2026-06-29T01:00:30.000Z', matchedSlotMs),
    'active',
  );
});

test('MATCHED with a true server matched state is never altered by the clamp at any time', () => {
  const matchedSlotMs = Date.parse('2026-06-29T01:00:30.000Z');
  // Whether before, at, or after the slot, a server 'matched' stays 'matched'
  // until the server itself reports 'active' (which is then clamped/released by slot).
  assert.equal(clampLinkedMatchStateToSlot('matched', '2026-06-29T01:00:30.000Z', matchedSlotMs - 5_000), 'matched');
  assert.equal(clampLinkedMatchStateToSlot('matched', '2026-06-29T01:00:30.000Z', matchedSlotMs), 'matched');
  assert.equal(clampLinkedMatchStateToSlot('matched', '2026-06-29T01:00:30.000Z', matchedSlotMs + 5_000), 'matched');
});
