import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveSlotPhase,
  resolveActiveMatchSlot,
  selectCountdownDigit,
} from './liveMatchSlot';
import { resetCountdownLockStoreForTest } from './countdownLockStore';

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

test('resolveActiveMatchSlot: a stale (elapsed) frozen slot is replaced by a fresh future re-arm', () => {
  // The guest first observes slot A (future) → freezes A. The match is then re-armed to a
  // LATER slot B while A has already elapsed. With the live clock the freeze MUST adopt B —
  // else the countdown pins to the dead instant A (selectCountdownDigit→null, and the
  // slot-gated arena open sees slotPassed=true → skips the countdown). This is the freeze
  // half of the slot-propagation fix (paired with re-enabling the pre-slot room poll).
  const SLOT_A_MS = Date.parse('2026-06-30T01:00:00.000Z');
  const SLOT_B_ISO = '2026-06-30T01:00:40.000Z'; // +40s re-arm
  const SLOT_B_MS = Date.parse(SLOT_B_ISO);

  const first = resolveActiveMatchSlot({
    room: { linkedMatchId: 'rearm-match', linkedMatchSlotStartAt: '2026-06-30T01:00:00.000Z' },
    syncedNowMs: SLOT_A_MS - 15_000, // 15s before A — frozen as a future instant
  });
  assert.deepEqual(first, { matchId: 'rearm-match', slotStartMs: SLOT_A_MS });

  const rearmed = resolveActiveMatchSlot({
    room: { linkedMatchId: 'rearm-match', linkedMatchSlotStartAt: SLOT_B_ISO },
    syncedNowMs: SLOT_A_MS + 5_000, // past A, still 35s before B
  });
  assert.deepEqual(rearmed, { matchId: 'rearm-match', slotStartMs: SLOT_B_MS });
});

test('resolveActiveMatchSlot: a STILL-FUTURE frozen slot absorbs jitter even with the clock provided', () => {
  // A small forward nudge while the frozen slot is still in the FUTURE must be absorbed —
  // the freeze only swaps a stale/elapsed instant, never a live one, so no mid-countdown
  // re-flash.
  const first = resolveActiveMatchSlot({
    directMatch: { matchId: 'jitter-match', slotStartAt: SLOT_ISO },
    syncedNowMs: SLOT_MS - 20_000,
  });
  assert.deepEqual(first, { matchId: 'jitter-match', slotStartMs: SLOT_MS });

  const nudged = resolveActiveMatchSlot({
    directMatch: { matchId: 'jitter-match', slotStartAt: '2026-06-30T01:00:03.000Z' },
    syncedNowMs: SLOT_MS - 17_000, // still before the original slot
  });
  assert.deepEqual(nudged, { matchId: 'jitter-match', slotStartMs: SLOT_MS });
});

test('resolveActiveMatchSlot: skips a slotless room and uses the next candidate', () => {
  const slot = resolveActiveMatchSlot({
    room: { linkedMatchId: null, slotStartAt: null },
    directMatch: { matchId: 'm2', slotStartAt: SLOT_ISO },
  });
  assert.deepEqual(slot, { matchId: 'm2', slotStartMs: SLOT_MS });
});
