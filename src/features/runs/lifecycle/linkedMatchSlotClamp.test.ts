import assert from 'node:assert/strict';
import test from 'node:test';
import {
  derivePartyRunStartPhase,
  shouldEnterMatchArenaForLifecycle,
} from './matchStateMachine';

// ---------------------------------------------------------------------------
// STAGE 2 (clean core) — the party-run start PHASE is SLOT-GATED.
//
// Previous model (removed): a client-side clampLinkedMatchStateToSlot held the
// server 'active' at 'matched' until this phone's slot, plus an ACTIVE_INFERENCE
// grace and a pre-slot room-active phase leak that was tolerated as "harmless".
//
// New model: derivePartyRunStartPhase reports 'active' ONLY once THIS phone's slot
// is reached (remaining≤0 or syncedNow≥slot). A SHARED session that hydrates
// 'active' early (the host's pre-start warm-up) can NEVER pre-empt this phone's
// countdown — serverActive (roomState/linkedMatchStatus === 'active') corroborates
// only at/after the slot, and acts as the sole signal only when there is no
// parseable slot at all (a re-join into an already-running match). The single slot
// gate for the reported server STATE now lives on the backend status endpoint.
// ---------------------------------------------------------------------------

const SLOT_ISO = '2026-06-29T00:00:18.000Z';
const SLOT_MS = Date.parse(SLOT_ISO);

// ---- serverActive can NEVER pre-empt a still-running countdown --------------

test('phase: shared-session early-active does NOT skip the guest countdown (pre-slot → not active)', () => {
  // Guest at slot - 6s: 6s countdown on screen; the shared session already reports
  // 'active' because the host started measuring early. The guest must STILL count down.
  const phase = derivePartyRunStartPhase({
    roomState: 'arming',
    linkedMatchStatus: 'active',
    isCountdownReady: false,
    remainingSeconds: 6,
    linkedMatchId: 'room-match-1',
    linkedMatchSlotStartAt: SLOT_ISO,
    syncedNowMs: SLOT_MS - 6_000,
  });
  assert.notEqual(phase, 'active');
  // 6s remaining is inside the ≤20s arena-handoff window.
  assert.equal(phase, 'arenaHandoff');
});

test('phase: host room going active pre-slot does NOT pre-empt the slot (no early active)', () => {
  // Even the host's own room flipping 'active' must not skip THIS phone's countdown:
  // the slot is the single gate, so pre-slot it stays a countdown phase.
  const phase = derivePartyRunStartPhase({
    roomState: 'active',
    linkedMatchStatus: 'matched',
    remainingSeconds: 25,
    linkedMatchId: 'room-match-1',
    linkedMatchSlotStartAt: SLOT_ISO,
    syncedNowMs: SLOT_MS - 25_000,
  });
  assert.notEqual(phase, 'active');
  // 25s remaining → inside the 30s overlay window but past the 20s handoff → countdown.
  assert.equal(phase, 'countdown');
});

test('phase: active EXACTLY at the slot (remaining reaches 0 on the synced clock)', () => {
  assert.equal(
    derivePartyRunStartPhase({
      roomState: 'arming',
      linkedMatchStatus: 'matched',
      remainingSeconds: null,
      linkedMatchId: 'room-match-1',
      linkedMatchSlotStartAt: SLOT_ISO,
      syncedNowMs: SLOT_MS,
    }),
    'active',
  );
});

test('phase: a remainingSeconds<=0 reading alone reaches active (post-slot, syncedNow not supplied)', () => {
  assert.equal(
    derivePartyRunStartPhase({
      roomState: 'arming',
      linkedMatchStatus: 'matched',
      remainingSeconds: 0,
      linkedMatchId: 'room-match-1',
      linkedMatchSlotStartAt: SLOT_ISO,
      syncedNowMs: null,
    }),
    'active',
  );
});

test('phase: server-active room snapshot AT/after the slot resolves active', () => {
  assert.equal(
    derivePartyRunStartPhase({
      roomState: 'arming',
      linkedMatchStatus: 'active',
      remainingSeconds: null,
      linkedMatchId: 'room-match-1',
      linkedMatchSlotStartAt: SLOT_ISO,
      syncedNowMs: SLOT_MS + 200,
    }),
    'active',
  );
});

test('phase: with NO parseable slot, serverActive is the only signal and promotes (re-join)', () => {
  assert.equal(
    derivePartyRunStartPhase({
      roomState: 'arming',
      linkedMatchStatus: 'active',
      remainingSeconds: null,
      linkedMatchId: 'room-match-1',
      linkedMatchSlotStartAt: null,
      syncedNowMs: SLOT_MS,
    }),
    'active',
  );
});

test('phase: NO active inference grace — a far-future slot with serverActive stays pre-slot', () => {
  // The removed ACTIVE_INFERENCE_GRACE would have inferred 'active' from a slightly-
  // elapsed or null remaining. The clean core does not: 85s out, serverActive true,
  // the phase is still pre-slot (arming, far outside the matched window).
  const phase = derivePartyRunStartPhase({
    roomState: 'arming',
    linkedMatchStatus: 'active',
    remainingSeconds: 85,
    linkedMatchId: 'room-match-1',
    linkedMatchSlotStartAt: '2026-06-29T00:01:43.000Z',
    syncedNowMs: SLOT_MS - 85_000,
  });
  assert.notEqual(phase, 'active');
  assert.equal(phase, 'arming');
});

// ---- countdown-window mapping (matched / inferred-matched) ------------------

test('phase: inside the 30s overlay window resolves countdown; inside 20s resolves arenaHandoff', () => {
  const base = {
    roomState: 'arming' as const,
    linkedMatchStatus: 'matched' as const,
    linkedMatchId: 'room-match-1',
    linkedMatchSlotStartAt: SLOT_ISO,
  };
  assert.equal(
    derivePartyRunStartPhase({ ...base, remainingSeconds: 28, syncedNowMs: SLOT_MS - 28_000 }),
    'countdown',
  );
  assert.equal(
    derivePartyRunStartPhase({ ...base, remainingSeconds: 18, syncedNowMs: SLOT_MS - 18_000 }),
    'arenaHandoff',
  );
});

test('phase: host/guest divergence — a linked slot inside the matched-equivalent window infers matched', () => {
  // Guest sees the slot (linkedMatchId + slot) but linkedMatchStatus has not yet
  // arrived. 45s out is inside the 60s inferred-matched window → arming (waiting on
  // the digit), NOT waiting.
  const phase = derivePartyRunStartPhase({
    roomState: 'arming',
    linkedMatchStatus: null,
    remainingSeconds: 45,
    linkedMatchId: 'room-match-1',
    linkedMatchSlotStartAt: '2026-06-29T00:01:03.000Z',
    syncedNowMs: SLOT_MS - 45_000,
  });
  assert.equal(phase, 'arming');
});

// ---- arena force-open consumer is slot-gated THROUGH the phase --------------
//
// shouldEnterMatchArenaForLifecycle still force-opens on duelState/groupState ===
// 'active'. With the clean core the stored state is now slot-gated by the BACKEND
// (it reports 'matched' until the slot), so the consumer never sees a pre-slot
// 'active'. These assert the consumer's own contract at the boundary.

test('arena consumer: a matched (pre-slot) state does NOT force-open the arena', () => {
  assert.equal(
    shouldEnterMatchArenaForLifecycle({
      duelState: 'matched',
      groupState: 'idle',
      duelShouldOpenCountdownArena: false,
      groupShouldOpenCountdownArena: false,
    }),
    false,
  );
});

test('arena consumer: an active (at/after slot) state DOES force-open the arena', () => {
  assert.equal(
    shouldEnterMatchArenaForLifecycle({
      duelState: 'active',
      groupState: 'idle',
      duelShouldOpenCountdownArena: false,
      groupShouldOpenCountdownArena: false,
    }),
    true,
  );
});
