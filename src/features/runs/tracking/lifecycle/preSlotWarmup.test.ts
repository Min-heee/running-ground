import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isWarmupEraSnapshot,
  PRE_SLOT_WARMUP_STALE_AFTER_MS,
  PRE_SLOT_WARMUP_WINDOW_MS,
  resolvePreSlotWarmupTarget,
} from '@/features/runs/tracking/lifecycle/preSlotWarmup';

// 회원K 파티런 2026-08-10 (duel-match-80d88038): the entire tracking arm waited for
// state === 'active' (countdown END), so a Galaxy locked 1-2s after the countdown froze the arm
// mid-chain and ran the whole match at 0.00km. This helper is the trigger that arms the plumbing
// DURING the countdown instead — while the runner is watching the screen.

const NOW = 1_700_000_000_000;

function slotIn(ms: number) {
  return new Date(NOW + ms).toISOString();
}

test('the incident shape: a matched party-run room context inside the countdown warms up', () => {
  const target = resolvePreSlotWarmupTarget({
    matchMode: 'duel',
    duelMatchStatus: null,
    groupMatchStatus: null,
    // The party-run handoff: linked context appears as 'matched' with the slot ~10s out.
    roomLinkedMatchContext: {
      mode: 'duel',
      state: 'matched',
      matchId: 'duel-match-80d88038',
      slotStartAt: slotIn(10_000),
    },
    nowMs: NOW,
  });

  assert.deepEqual(target, { matchId: 'duel-match-80d88038', slotStartAt: slotIn(10_000) });
});

test('a scheduled duel warms up only inside the ≤20s arena window', () => {
  const base = {
    matchMode: 'duel',
    groupMatchStatus: null,
    roomLinkedMatchContext: null,
    nowMs: NOW,
  };

  // Slot far out — matched hours ahead must NOT spin GPS early.
  assert.equal(resolvePreSlotWarmupTarget({
    ...base,
    duelMatchStatus: { state: 'matched', matchId: 'duel-1', slotStartAt: slotIn(PRE_SLOT_WARMUP_WINDOW_MS + 1) },
  }), null);

  // Exactly at the window edge — arm.
  assert.deepEqual(resolvePreSlotWarmupTarget({
    ...base,
    duelMatchStatus: { state: 'matched', matchId: 'duel-1', slotStartAt: slotIn(PRE_SLOT_WARMUP_WINDOW_MS) },
  }), { matchId: 'duel-1', slotStartAt: slotIn(PRE_SLOT_WARMUP_WINDOW_MS) });

  // Slot just passed but still 'matched' (promotion poll lag) — arming is exactly what that lag
  // needs, so it stays eligible.
  assert.deepEqual(resolvePreSlotWarmupTarget({
    ...base,
    duelMatchStatus: { state: 'matched', matchId: 'duel-1', slotStartAt: slotIn(-30_000) },
  }), { matchId: 'duel-1', slotStartAt: slotIn(-30_000) });

  // Long-dead matched context (abandoned, awaiting prune) — never arm.
  assert.equal(resolvePreSlotWarmupTarget({
    ...base,
    duelMatchStatus: { state: 'matched', matchId: 'duel-1', slotStartAt: slotIn(-PRE_SLOT_WARMUP_STALE_AFTER_MS - 1) },
  }), null);
});

test('only matched live matches qualify — active/solo/foreign-mode contexts never re-trigger', () => {
  // Already active: the active path owns the start; warmup must not double-fire.
  assert.equal(resolvePreSlotWarmupTarget({
    matchMode: 'duel',
    duelMatchStatus: { state: 'active', matchId: 'duel-1', slotStartAt: slotIn(0) },
    groupMatchStatus: null,
    roomLinkedMatchContext: null,
    nowMs: NOW,
  }), null);

  // Solo has its own warmup flow.
  assert.equal(resolvePreSlotWarmupTarget({
    matchMode: 'solo',
    duelMatchStatus: { state: 'matched', matchId: 'duel-1', slotStartAt: slotIn(5_000) },
    groupMatchStatus: null,
    roomLinkedMatchContext: null,
    nowMs: NOW,
  }), null);

  // A room context for a DIFFERENT mode must not leak across.
  assert.equal(resolvePreSlotWarmupTarget({
    matchMode: 'group',
    duelMatchStatus: null,
    groupMatchStatus: null,
    roomLinkedMatchContext: { mode: 'duel', state: 'matched', matchId: 'duel-1', slotStartAt: slotIn(5_000) },
    nowMs: NOW,
  }), null);
});

test('mode-specific status wins over the room context, mirroring the active path precedence', () => {
  const target = resolvePreSlotWarmupTarget({
    matchMode: 'group',
    duelMatchStatus: null,
    groupMatchStatus: { state: 'matched', matchId: 'group-official', slotStartAt: slotIn(8_000) },
    roomLinkedMatchContext: { mode: 'group', state: 'matched', matchId: 'group-room', slotStartAt: slotIn(8_000) },
    nowMs: NOW,
  });

  assert.deepEqual(target, { matchId: 'group-official', slotStartAt: slotIn(8_000) });
});

// 적대 검증 2026-08-11: the window must be judged PER CANDIDATE. A scheduled duel matched hours out
// used to SHADOW an in-window party-run room countdown (precedence picked it first, then the window
// check nulled everything) — silently disabling the warmup for exactly the incident this exists for.
test('an out-of-window status candidate cannot shadow an in-window room candidate', () => {
  const target = resolvePreSlotWarmupTarget({
    matchMode: 'duel',
    duelMatchStatus: { state: 'matched', matchId: 'duel-tonight', slotStartAt: slotIn(2 * 60 * 60 * 1000) },
    groupMatchStatus: null,
    roomLinkedMatchContext: { mode: 'duel', state: 'matched', matchId: 'party-now', slotStartAt: slotIn(10_000) },
    nowMs: NOW,
  });

  assert.deepEqual(target, { matchId: 'party-now', slotStartAt: slotIn(10_000) });
});

// 적대 검증 2026-08-11: the warmup ref dies with the process, but the snapshot's own startedAt does
// not — restore paths re-mark a pre-slot-started session so the baseline rebuilds and the countdown
// meters/seconds stay out of the official result.
test('isWarmupEraSnapshot: only a session started strictly before the slot is warmup-era', () => {
  assert.equal(isWarmupEraSnapshot(slotIn(-15_000), slotIn(0)), true);
  assert.equal(isWarmupEraSnapshot(slotIn(0), slotIn(0)), false);
  assert.equal(isWarmupEraSnapshot(slotIn(5_000), slotIn(0)), false);
  // Unparseable input must never claim warmup-era (it would wrongly rebase a normal run).
  assert.equal(isWarmupEraSnapshot(null, slotIn(0)), false);
  assert.equal(isWarmupEraSnapshot(slotIn(-15_000), undefined), false);
  assert.equal(isWarmupEraSnapshot('not-a-date', slotIn(0)), false);
});

test('malformed input never arms: missing ids, missing/garbled slot times', () => {
  const base = { matchMode: 'duel', groupMatchStatus: null, roomLinkedMatchContext: null, nowMs: NOW };

  assert.equal(resolvePreSlotWarmupTarget({
    ...base,
    duelMatchStatus: { state: 'matched', matchId: '', slotStartAt: slotIn(5_000) },
  }), null);
  assert.equal(resolvePreSlotWarmupTarget({
    ...base,
    duelMatchStatus: { state: 'matched', matchId: 'duel-1', slotStartAt: null },
  }), null);
  assert.equal(resolvePreSlotWarmupTarget({
    ...base,
    duelMatchStatus: { state: 'matched', matchId: 'duel-1', slotStartAt: 'not-a-date' },
  }), null);
  assert.equal(resolvePreSlotWarmupTarget({ ...base, duelMatchStatus: null }), null);
});
