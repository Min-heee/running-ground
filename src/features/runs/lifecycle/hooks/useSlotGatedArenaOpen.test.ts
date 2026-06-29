import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSlotGatedArenaOpen } from './useSlotGatedArenaOpen';

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 3 (clean core) — the single slot-gated arena-open decision. The arena may
// force-open ONLY when: syncedNow>=slot, OR serverActive corroborates at/after the
// slot, OR there is an explicit route force. It must NEVER open while a countdown is
// still running (the skip this rewrite removes).
// ─────────────────────────────────────────────────────────────────────────────

const SLOT_MS = Date.parse('2026-06-30T01:00:00.000Z');

test('does NOT open pre-slot, even when the server reports active (host warm-up)', () => {
  assert.equal(
    resolveSlotGatedArenaOpen({
      slotStartMs: SLOT_MS,
      syncedNowMs: SLOT_MS - 6_000,
      serverActive: true,
      routeForceMatchArena: false,
    }),
    false,
  );
  // 85s out, server warm-up-active: still closed.
  assert.equal(
    resolveSlotGatedArenaOpen({
      slotStartMs: SLOT_MS,
      syncedNowMs: SLOT_MS - 85_000,
      serverActive: true,
      routeForceMatchArena: false,
    }),
    false,
  );
});

test('opens EXACTLY at the slot', () => {
  assert.equal(
    resolveSlotGatedArenaOpen({
      slotStartMs: SLOT_MS,
      syncedNowMs: SLOT_MS,
      serverActive: false,
      routeForceMatchArena: false,
    }),
    true,
  );
  // 1ms before: still closed.
  assert.equal(
    resolveSlotGatedArenaOpen({
      slotStartMs: SLOT_MS,
      syncedNowMs: SLOT_MS - 1,
      serverActive: false,
      routeForceMatchArena: false,
    }),
    false,
  );
});

test('opens after the slot (re-join into an already-running match whose slot is past)', () => {
  assert.equal(
    resolveSlotGatedArenaOpen({
      slotStartMs: SLOT_MS,
      syncedNowMs: SLOT_MS + 5 * 60_000,
      serverActive: true,
      routeForceMatchArena: false,
    }),
    true,
  );
});

test('the explicit route force opens immediately, bypassing the slot gate', () => {
  assert.equal(
    resolveSlotGatedArenaOpen({
      slotStartMs: SLOT_MS,
      syncedNowMs: SLOT_MS - 120_000,
      serverActive: false,
      routeForceMatchArena: true,
    }),
    true,
  );
});

test('with no parseable slot, serverActive is the only signal', () => {
  assert.equal(
    resolveSlotGatedArenaOpen({
      slotStartMs: null,
      syncedNowMs: SLOT_MS,
      serverActive: true,
      routeForceMatchArena: false,
    }),
    true,
  );
  assert.equal(
    resolveSlotGatedArenaOpen({
      slotStartMs: null,
      syncedNowMs: SLOT_MS,
      serverActive: false,
      routeForceMatchArena: false,
    }),
    false,
  );
});
