import assert from 'node:assert/strict';
import test from 'node:test';

import { MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS } from '@/lib/matchCountdown';
import {
  readLockedCountdownTargetMs,
  resetLockedCountdownTargetForTest,
  resolveLockedCountdownTarget,
} from '@/features/runs/lifecycle/hooks/useMatchCountdownModel';

// The reservation rooms (useDuelReservationRoom / useGroupReservationRoom) no longer
// drive the centered start overlay off a PRIVATE per-second ticker. Instead they build a
// { countdownKey, targetMs, secondsRemaining } payload by calling the SAME shared
// resolveLockedCountdownTarget helper the running-tab runtime uses, keyed by the shared
// `${matchId}:${slotStartAt}` scheme and clamped to the 30s overlay window. These tests
// exercise exactly that derivation (the pure core the hook performs) so two phones — and
// the reservation→running-tab handoff for the same match — lock to one absolute instant.

// Mirrors the reservation hook's overlay derivation: lock the shared target, then read it
// back, gating on a finite remaining inside the overlay window.
function deriveReservationCountdownOverlay({
  matchId,
  slotStartAt,
  rawRemainingSeconds,
  rawRemainingMs,
  nowMs,
}: {
  matchId: string | null;
  slotStartAt: string | null;
  rawRemainingSeconds: number | null;
  rawRemainingMs: number | null;
  nowMs: number;
}) {
  const countdownKey = matchId && slotStartAt ? `${matchId}:${slotStartAt}` : null;
  const secondsRemaining = resolveLockedCountdownTarget({
    key: countdownKey,
    maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
    rawRemainingSeconds,
    rawRemainingMs,
    nowMs,
  });
  const targetMs = readLockedCountdownTargetMs(countdownKey);
  if (!countdownKey || rawRemainingSeconds === null || secondsRemaining === null) {
    return null;
  }
  return { countdownKey, targetMs, secondsRemaining };
}

test('reservation overlay derives a locked targetMs from the shared helper (no private ticker)', () => {
  resetLockedCountdownTargetForTest();

  try {
    const overlay = deriveReservationCountdownOverlay({
      matchId: 'match-duel',
      slotStartAt: '2026-05-20T12:00:30.000Z',
      rawRemainingSeconds: 28,
      rawRemainingMs: 28_000,
      nowMs: 1_000,
    });

    assert.ok(overlay);
    // Shared `${matchId}:${slotStartAt}` key — identical to the room + runtime entry for
    // the same match, so the monotonic floor + finished-key guard carry across the
    // reservation→running-tab handoff with no re-flash.
    assert.equal(overlay?.countdownKey, 'match-duel:2026-05-20T12:00:30.000Z');
    // A non-null absolute target (nowMs + rawRemainingMs) — the overlay runs its rAF off
    // this, NOT off a per-second prop that each phone would round differently.
    assert.equal(overlay?.targetMs, 29_000);
    assert.equal(overlay?.secondsRemaining, 28);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('reservation overlay is null outside the 30s window (helper has not locked yet)', () => {
  resetLockedCountdownTargetForTest();

  try {
    // 45s out: outside the overlay window, the shared helper returns null → no overlay.
    const overlay = deriveReservationCountdownOverlay({
      matchId: 'match-group',
      slotStartAt: '2026-05-20T12:00:45.000Z',
      rawRemainingSeconds: 45,
      rawRemainingMs: 45_000,
      nowMs: 0,
    });

    assert.equal(overlay, null);
    assert.equal(readLockedCountdownTargetMs('match-group:2026-05-20T12:00:45.000Z'), null);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('reservation overlay stays locked to one instant across the per-render clock ticks', () => {
  resetLockedCountdownTargetForTest();
  const matchId = 'match-duel';
  const slotStartAt = '2026-05-20T12:00:30.000Z';

  try {
    const first = deriveReservationCountdownOverlay({
      matchId,
      slotStartAt,
      rawRemainingSeconds: 26,
      rawRemainingMs: 26_000,
      nowMs: 0,
    });
    assert.equal(first?.targetMs, 26_000);

    // A later gating tick (the view clock advanced) with jittered raw must NOT move the
    // locked target — only the displayed digit steps down off the frozen instant.
    const later = deriveReservationCountdownOverlay({
      matchId,
      slotStartAt,
      rawRemainingSeconds: 24,
      rawRemainingMs: 23_900,
      nowMs: 2_000,
    });
    assert.equal(later?.targetMs, 26_000);
    assert.equal(later?.secondsRemaining, 24);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});
