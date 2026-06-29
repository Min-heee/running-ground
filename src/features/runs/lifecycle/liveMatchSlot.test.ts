import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveSlotPhase,
  FREEZE_ELIGIBLE_AHEAD_MS,
  isSlotFreezeEligible,
  resolveActiveMatchSlot,
  resolveFrozenSlotMs,
  selectCountdownDigit,
} from './liveMatchSlot';
import {
  readFrozenSlotStartMsForMatch,
  resetCountdownLockStoreForTest,
} from './countdownLockStore';

const PLACEHOLDER_MS = Date.parse('2026-06-30T03:00:00.000Z'); // far-future duel-status sentinel

// ─────────────────────────────────────────────────────────────────────────────
// Pure live-match slot core (clean rewrite). ONE fact — Date.now()+offset >= slot
// — drives the digit, the phase, the arena open, and the GPS start. These tests
// pin the clean-core behavior: the digit ALWAYS renders in-window (no clockReady),
// phase is 'active' only at/after the slot, and serverActive can only corroborate.
// ─────────────────────────────────────────────────────────────────────────────

const SLOT_ISO = '2026-06-30T01:00:00.000Z';
const SLOT_MS = Date.parse(SLOT_ISO);
const PARTY_WINDOW = 10;
const MATCHED_WINDOW = 30;

test.beforeEach(() => {
  resetCountdownLockStoreForTest();
});

// ── selectCountdownDigit ────────────────────────────────────────────────────

test('selectCountdownDigit: ceil within the window, both windows', () => {
  // 30s out on the matched window → 30. 9.4s out → ceil = 10? no: ceil(9.4)=10
  assert.equal(
    selectCountdownDigit({ slotStartMs: SLOT_MS, syncedNowMs: SLOT_MS - 30_000, windowSeconds: MATCHED_WINDOW }),
    30,
  );
  assert.equal(
    selectCountdownDigit({ slotStartMs: SLOT_MS, syncedNowMs: SLOT_MS - 1, windowSeconds: MATCHED_WINDOW }),
    1,
  );
  assert.equal(
    selectCountdownDigit({ slotStartMs: SLOT_MS, syncedNowMs: SLOT_MS - 9_400, windowSeconds: PARTY_WINDOW }),
    10,
  );
});

test('selectCountdownDigit: null outside the window (too far out)', () => {
  assert.equal(
    selectCountdownDigit({ slotStartMs: SLOT_MS, syncedNowMs: SLOT_MS - 30_001, windowSeconds: MATCHED_WINDOW }),
    null,
  );
  // Party window is 10s — 11s out is out of window.
  assert.equal(
    selectCountdownDigit({ slotStartMs: SLOT_MS, syncedNowMs: SLOT_MS - 11_000, windowSeconds: PARTY_WINDOW }),
    null,
  );
});

test('selectCountdownDigit: null at and past the slot', () => {
  assert.equal(
    selectCountdownDigit({ slotStartMs: SLOT_MS, syncedNowMs: SLOT_MS, windowSeconds: MATCHED_WINDOW }),
    null,
  );
  assert.equal(
    selectCountdownDigit({ slotStartMs: SLOT_MS, syncedNowMs: SLOT_MS + 5_000, windowSeconds: MATCHED_WINDOW }),
    null,
  );
});

test('selectCountdownDigit: renders the digit REGARDLESS of any clock-trust signal', () => {
  // The pure function has no clockReady input — the digit follows the offset. This
  // is the core fix: a cold, not-yet-trusted clock still shows the number.
  for (let remaining = 1; remaining <= MATCHED_WINDOW; remaining += 1) {
    const digit = selectCountdownDigit({
      slotStartMs: SLOT_MS,
      syncedNowMs: SLOT_MS - remaining * 1000,
      windowSeconds: MATCHED_WINDOW,
    });
    assert.equal(digit, remaining, `remaining=${remaining}`);
  }
});

test('selectCountdownDigit: null for an unparseable/absent slot', () => {
  assert.equal(selectCountdownDigit({ slotStartMs: null, syncedNowMs: SLOT_MS, windowSeconds: MATCHED_WINDOW }), null);
  assert.equal(
    selectCountdownDigit({ slotStartMs: Number.NaN, syncedNowMs: SLOT_MS, windowSeconds: MATCHED_WINDOW }),
    null,
  );
});

test('selectCountdownDigit: counts 30→1 smoothly across the whole window', () => {
  const seen: number[] = [];
  for (let ms = 30_000; ms >= 1; ms -= 250) {
    const digit = selectCountdownDigit({
      slotStartMs: SLOT_MS,
      syncedNowMs: SLOT_MS - ms,
      windowSeconds: MATCHED_WINDOW,
    });
    if (typeof digit === 'number' && (seen.length === 0 || seen[seen.length - 1] !== digit)) {
      seen.push(digit);
    }
  }
  // Monotonic non-increasing 30 … 1, no gaps, no re-flash.
  assert.deepEqual(seen, Array.from({ length: 30 }, (_unused, index) => 30 - index));
});

// ── deriveSlotPhase ─────────────────────────────────────────────────────────

test('deriveSlotPhase: pre when remaining > window', () => {
  assert.equal(
    deriveSlotPhase({ slotStartMs: SLOT_MS, syncedNowMs: SLOT_MS - 31_000, windowSeconds: MATCHED_WINDOW }),
    'pre',
  );
});

test('deriveSlotPhase: countdown inside the window', () => {
  assert.equal(
    deriveSlotPhase({ slotStartMs: SLOT_MS, syncedNowMs: SLOT_MS - 30_000, windowSeconds: MATCHED_WINDOW }),
    'countdown',
  );
  assert.equal(
    deriveSlotPhase({ slotStartMs: SLOT_MS, syncedNowMs: SLOT_MS - 1, windowSeconds: MATCHED_WINDOW }),
    'countdown',
  );
});

test('deriveSlotPhase: active only at/after the slot', () => {
  assert.equal(
    deriveSlotPhase({ slotStartMs: SLOT_MS, syncedNowMs: SLOT_MS, windowSeconds: MATCHED_WINDOW }),
    'active',
  );
  assert.equal(
    deriveSlotPhase({ slotStartMs: SLOT_MS, syncedNowMs: SLOT_MS + 60_000, windowSeconds: MATCHED_WINDOW }),
    'active',
  );
});

test('deriveSlotPhase: serverActive CANNOT pre-empt a still-running countdown', () => {
  // Host warm-up flips the SHARED session 'active' 85s before the guest slot.
  // The guest must STILL count down — serverActive may corroborate only at slot.
  assert.equal(
    deriveSlotPhase({
      slotStartMs: SLOT_MS,
      syncedNowMs: SLOT_MS - 85_000,
      windowSeconds: MATCHED_WINDOW,
      serverActive: true,
    }),
    'pre',
  );
  assert.equal(
    deriveSlotPhase({
      slotStartMs: SLOT_MS,
      syncedNowMs: SLOT_MS - 5_000,
      windowSeconds: MATCHED_WINDOW,
      serverActive: true,
    }),
    'countdown',
  );
});

test('deriveSlotPhase: serverActive corroborates at/after the slot', () => {
  assert.equal(
    deriveSlotPhase({
      slotStartMs: SLOT_MS,
      syncedNowMs: SLOT_MS,
      windowSeconds: MATCHED_WINDOW,
      serverActive: true,
    }),
    'active',
  );
});

test('deriveSlotPhase: no parseable slot falls back to serverActive', () => {
  // A re-join into an already-running match whose slot is unknown.
  assert.equal(
    deriveSlotPhase({ slotStartMs: null, syncedNowMs: SLOT_MS, windowSeconds: MATCHED_WINDOW, serverActive: true }),
    'active',
  );
  assert.equal(
    deriveSlotPhase({ slotStartMs: null, syncedNowMs: SLOT_MS, windowSeconds: MATCHED_WINDOW, serverActive: false }),
    'pre',
  );
});

// ── resolveActiveMatchSlot ──────────────────────────────────────────────────

test('resolveActiveMatchSlot: prefers the room linked slot', () => {
  const slot = resolveActiveMatchSlot({
    room: { linkedMatchId: 'm1', linkedMatchSlotStartAt: SLOT_ISO, slotStartAt: '2026-06-30T02:00:00.000Z' },
    directMatch: { matchId: 'm2', slotStartAt: '2026-06-30T03:00:00.000Z' },
  });
  assert.deepEqual(slot, { matchId: 'm1', slotStartMs: SLOT_MS });
});

test('resolveActiveMatchSlot: falls back to room slotStartAt when no linked slot', () => {
  const slot = resolveActiveMatchSlot({
    room: { linkedMatchId: 'm1', linkedMatchSlotStartAt: null, slotStartAt: SLOT_ISO },
  });
  assert.deepEqual(slot, { matchId: 'm1', slotStartMs: SLOT_MS });
});

test('resolveActiveMatchSlot: direct match used when no room', () => {
  const slot = resolveActiveMatchSlot({
    directMatch: { matchId: 'm2', slotStartAt: SLOT_ISO },
  });
  assert.deepEqual(slot, { matchId: 'm2', slotStartMs: SLOT_MS });
});

test('resolveActiveMatchSlot: upcoming match used when no room or direct', () => {
  const slot = resolveActiveMatchSlot({
    upcomingMatch: { matchId: 'm3', slotStartAt: SLOT_ISO },
  });
  assert.deepEqual(slot, { matchId: 'm3', slotStartMs: SLOT_MS });
});

test('resolveActiveMatchSlot: null when no parseable slot anywhere', () => {
  assert.equal(resolveActiveMatchSlot({}), null);
  assert.equal(resolveActiveMatchSlot({ room: { linkedMatchId: 'm1', slotStartAt: 'not-a-date' } }), null);
  assert.equal(resolveActiveMatchSlot({ directMatch: { matchId: 'm2', slotStartAt: null } }), null);
});

test('resolveActiveMatchSlot: freezes the first slot per matchId against later re-stamps', () => {
  const first = resolveActiveMatchSlot({
    directMatch: { matchId: 'frozen-match', slotStartAt: SLOT_ISO },
  });
  assert.deepEqual(first, { matchId: 'frozen-match', slotStartMs: SLOT_MS });

  // A status echo re-stamps the slot 7s later — the frozen original wins, so the
  // countdownKey can't rotate mid-countdown and re-flash the digit.
  const restamped = resolveActiveMatchSlot({
    directMatch: { matchId: 'frozen-match', slotStartAt: '2026-06-30T01:00:07.000Z' },
  });
  assert.deepEqual(restamped, { matchId: 'frozen-match', slotStartMs: SLOT_MS });
});

test('resolveActiveMatchSlot: skips a slotless room and uses the next candidate', () => {
  const slot = resolveActiveMatchSlot({
    room: { linkedMatchId: null, slotStartAt: null },
    directMatch: { matchId: 'm2', slotStartAt: SLOT_ISO },
  });
  assert.deepEqual(slot, { matchId: 'm2', slotStartMs: SLOT_MS });
});

// ── freeze eligibility + placeholder-poison guard (the loop-STABILITY invariant) ─────────
// These pin the property the Maximum-update-depth crash violated: the slot resolved for a
// matchId must be STABLE across renders / advancing clock, and a far-future placeholder that
// SHARES the party matchId must never seed or flip the per-match freeze.

test('isSlotFreezeEligible: in-window future only', () => {
  const now = 1_000_000;
  assert.equal(isSlotFreezeEligible(now + 18_000, now), true);
  assert.equal(isSlotFreezeEligible(now + FREEZE_ELIGIBLE_AHEAD_MS, now), true);
  assert.equal(isSlotFreezeEligible(now + FREEZE_ELIGIBLE_AHEAD_MS + 1, now), false); // too far (placeholder)
  assert.equal(isSlotFreezeEligible(now, now), false); // not strictly future
  assert.equal(isSlotFreezeEligible(now - 1, now), false); // past (re-join)
  assert.equal(isSlotFreezeEligible(now + 18_000, undefined), true); // no clock → eligible (pure)
});

test('resolveFrozenSlotMs: an in-window slot freezes write-once; far-future/past are NOT frozen', () => {
  const now = SLOT_MS - 18_000;
  assert.equal(resolveFrozenSlotMs('m', SLOT_MS, now), SLOT_MS);
  assert.equal(readFrozenSlotStartMsForMatch('m'), SLOT_MS);

  resetCountdownLockStoreForTest();
  // Far-future placeholder → returned raw, Map untouched (cannot seed the freeze).
  assert.equal(resolveFrozenSlotMs('m', PLACEHOLDER_MS, now), PLACEHOLDER_MS);
  assert.equal(readFrozenSlotStartMsForMatch('m'), null);

  resetCountdownLockStoreForTest();
  // Already-past slot (a re-join) → returned raw, not frozen.
  assert.equal(resolveFrozenSlotMs('m', SLOT_MS, SLOT_MS + 5_000), SLOT_MS);
  assert.equal(readFrozenSlotStartMsForMatch('m'), null);
});

test('resolveFrozenSlotMs: a shared matchId seeded by the REAL slot is never flipped by the placeholder, even as the clock advances past the slot', () => {
  const nowAtSeed = SLOT_MS - 18_000;
  assert.equal(resolveFrozenSlotMs('M', SLOT_MS, nowAtSeed), SLOT_MS); // seed M from the real slot
  // The duel placeholder candidate now arrives for the SAME matchId M while the clock crosses
  // the real slot — the frozen real instant wins on EVERY call (constant → openKey constant →
  // the arena guard reaches a fixed point; the inverse is what looped).
  for (const nowMs of [SLOT_MS - 1_000, SLOT_MS, SLOT_MS + 10_000, SLOT_MS + 60_000]) {
    assert.equal(resolveFrozenSlotMs('M', PLACEHOLDER_MS, nowMs), SLOT_MS, `nowMs=${nowMs}`);
  }
});

test('resolveFrozenSlotMs: the placeholder seen FIRST still does not seed M — the real slot wins', () => {
  const now = SLOT_MS - 18_000;
  assert.equal(resolveFrozenSlotMs('M', PLACEHOLDER_MS, now), PLACEHOLDER_MS); // not frozen
  assert.equal(readFrozenSlotStartMsForMatch('M'), null);
  assert.equal(resolveFrozenSlotMs('M', SLOT_MS, now), SLOT_MS); // real slot freezes M
  assert.equal(readFrozenSlotStartMsForMatch('M'), SLOT_MS);
});

test('resolveActiveMatchSlot: a stable room slot resolves identically across advancing syncedNowMs (openKey stability)', () => {
  const input = (syncedNowMs: number) => resolveActiveMatchSlot({
    room: { linkedMatchId: 'M', linkedMatchSlotStartAt: SLOT_ISO },
    directMatch: { matchId: 'M', slotStartAt: '2026-06-30T03:00:00.000Z' }, // placeholder, same matchId
    syncedNowMs,
  });
  const first = input(SLOT_MS - 18_000);
  assert.deepEqual(first, { matchId: 'M', slotStartMs: SLOT_MS });
  for (const nowMs of [SLOT_MS - 5_000, SLOT_MS, SLOT_MS + 30_000]) {
    assert.deepEqual(input(nowMs), { matchId: 'M', slotStartMs: SLOT_MS }, `nowMs=${nowMs}`);
  }
});
