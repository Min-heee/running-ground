import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLinkedMatchActiveTransition } from '@/features/runs/sync/partyRunSync/useLinkedMatchSync';

// ---------------------------------------------------------------------------
// Reproduction: party-run host-start GUEST is yanked into the measuring arena
// BEFORE their own countdown finishes because the SHARED linked session reports
// state:'active' early.
//
// Root cause: in a party run the linked duel/group session is shared. The backend
// flips it to 'active' the instant ANY participant pushes live progress
// (hydrateMatchSessionState → hasLiveProgress), which can land a beat before the
// guest's slot fires. The pre-fix transition rule
//     shouldTransitionToActive = payload.state === 'active' || hasCountdownFinished
// then fires on the bare `payload.state === 'active'` term while the guest's slot
// is still in the future, calling onForceOpenActiveMatchChange(true) and skipping
// the guest's centered countdown straight into the measuring arena.
//
// The fix keeps the SAME server-authoritative slot + this phone's synced clock the
// countdown uses, and only lets server-active force the transition AT/after the
// slot — never pre-empting a still-running local countdown.
// ---------------------------------------------------------------------------

// The pre-fix decision, kept verbatim so the test proves the OLD behavior was the
// bug and the NEW behavior fixes it on the very same inputs.
function legacyShouldTransitionToActive({
  serverState,
  slotStartMs,
  syncedNowMs,
}: {
  serverState: 'matched' | 'active' | null | undefined;
  slotStartMs: number;
  syncedNowMs: number;
}) {
  const hasCountdownFinished = Number.isFinite(slotStartMs) && syncedNowMs >= slotStartMs;
  return serverState === 'active' || hasCountdownFinished;
}

test('REPRO: shared session active before slot must NOT skip the guest past their countdown', () => {
  // Guest at slot - 6s: their countdown digit (6s) is on screen. The host has
  // started measuring early, so the SHARED linked session already reports active.
  const slotStartMs = Date.parse('2026-06-29T00:00:18.000Z');
  const syncedNowMs = slotStartMs - 6_000; // 6s of countdown still to run

  // The pre-fix rule WOULD have skipped the countdown (this is the captured bug).
  assert.equal(
    legacyShouldTransitionToActive({ serverState: 'active', slotStartMs, syncedNowMs }),
    true,
    'pre-fix rule transitioned to active 6s early — the exact non-host countdown skip',
  );

  // The fix must hold the guest on their countdown: no active transition yet.
  assert.equal(
    resolveLinkedMatchActiveTransition({ serverState: 'active', slotStartMs, syncedNowMs }),
    false,
    'fixed rule must NOT transition to active while the guest still has 6s of countdown left',
  );
});

test('fixed rule still transitions exactly when this phone\'s countdown finishes', () => {
  const slotStartMs = Date.parse('2026-06-29T00:00:18.000Z');

  // 1s before the slot: still counting down (server merely matched).
  assert.equal(
    resolveLinkedMatchActiveTransition({ serverState: 'matched', slotStartMs, syncedNowMs: slotStartMs - 1_000 }),
    false,
  );

  // At the slot instant: this phone's countdown has finished → transition.
  assert.equal(
    resolveLinkedMatchActiveTransition({ serverState: 'matched', slotStartMs, syncedNowMs: slotStartMs }),
    true,
  );

  // Just past the slot: still active.
  assert.equal(
    resolveLinkedMatchActiveTransition({ serverState: 'active', slotStartMs, syncedNowMs: slotStartMs + 500 }),
    true,
  );
});

test('server-active remains a valid backstop at/after the slot (sub-second skew safety net)', () => {
  const slotStartMs = Date.parse('2026-06-29T00:00:18.000Z');

  // Exactly at the slot, server says active and the local clock agrees — transition.
  assert.equal(
    resolveLinkedMatchActiveTransition({ serverState: 'active', slotStartMs, syncedNowMs: slotStartMs }),
    true,
  );
});

test('with no parseable slot, server-active is the only signal and still transitions', () => {
  // A match without a usable slotStartAt (NaN) falls back to the server state.
  assert.equal(
    resolveLinkedMatchActiveTransition({ serverState: 'active', slotStartMs: Number.NaN, syncedNowMs: Date.now() }),
    true,
  );
  assert.equal(
    resolveLinkedMatchActiveTransition({ serverState: 'matched', slotStartMs: Number.NaN, syncedNowMs: Date.now() }),
    false,
  );
});
