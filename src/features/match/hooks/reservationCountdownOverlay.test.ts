import assert from 'node:assert/strict';
import test from 'node:test';

import { MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS } from '@/lib/matchCountdown';
import {
  readLockedCountdownTargetMs,
  resetLockedCountdownTargetForTest,
  resolveLockedCountdownTarget,
} from '@/features/runs/lifecycle/hooks/useMatchCountdownModel';

// The reservation rooms (useDuelReservationRoom / useGroupReservationRoom) build a
// { countdownKey, targetMs, secondsRemaining } payload by calling the SAME shared
// resolveLockedCountdownTarget helper the running-tab runtime uses, keyed by the shared
// `${matchId}:${slotStartAt}` scheme and clamped to the 30s overlay window. The lock now
// freezes on the ABSOLUTE SERVER instant (slotStartMs) — only once the clock is READY — so
// two phones (and the reservation→running-tab handoff for the same match) tick one absolute
// instant against the live offset. These tests exercise that derivation.

// Mirrors the reservation hook's overlay derivation: lock the shared SERVER-instant target,
// then read it back, gating on a finite remaining inside the overlay window.
function deriveReservationCountdownOverlay({
  matchId,
  slotStartAt,
  slotStartMs,
  syncedNowMs,
  clockReady = true,
}: {
  matchId: string | null;
  slotStartAt: string | null;
  slotStartMs: number | null;
  syncedNowMs: number;
  clockReady?: boolean;
}) {
  const countdownKey = matchId && slotStartAt ? `${matchId}:${slotStartAt}` : null;
  const rawRemainingMs = slotStartMs !== null ? slotStartMs - syncedNowMs : null;
  const rawRemainingSeconds = rawRemainingMs !== null && rawRemainingMs > 0
    ? Math.max(1, Math.round(rawRemainingMs / 1000))
    : null;
  const secondsRemaining = resolveLockedCountdownTarget({
    key: countdownKey,
    maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
    rawRemainingSeconds,
    rawRemainingMs,
    slotStartMs,
    syncedNowMs,
    clockReady,
  });
  const targetMs = readLockedCountdownTargetMs(countdownKey);
  if (!countdownKey || rawRemainingSeconds === null || secondsRemaining === null) {
    return null;
  }
  return { countdownKey, targetMs, secondsRemaining };
}

test('reservation overlay derives a locked SERVER-instant targetMs from the shared helper', () => {
  resetLockedCountdownTargetForTest();

  try {
    // slot at server-instant 30_000; synced now 2_000 → 28s out, inside the 30s window.
    const overlay = deriveReservationCountdownOverlay({
      matchId: 'match-duel',
      slotStartAt: '2026-05-20T12:00:30.000Z',
      slotStartMs: 30_000,
      syncedNowMs: 2_000,
    });

    assert.ok(overlay);
    // Shared `${matchId}:${slotStartAt}` key — identical to the room + runtime entry for the
    // same match, so the lock + finished-key guard carry across the reservation→running-tab
    // handoff with no re-flash.
    assert.equal(overlay?.countdownKey, 'match-duel:2026-05-20T12:00:30.000Z');
    // The locked target is the ABSOLUTE SERVER instant (slotStartMs), NOT nowMs+raw — the
    // overlay ticks THIS against the live offset, so both phones agree.
    assert.equal(overlay?.targetMs, 30_000);
    assert.equal(overlay?.secondsRemaining, 28);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('reservation overlay is null outside the 30s window (helper has not locked yet)', () => {
  resetLockedCountdownTargetForTest();

  try {
    // 45s out: outside the overlay window → no lock, no overlay.
    const overlay = deriveReservationCountdownOverlay({
      matchId: 'match-group',
      slotStartAt: '2026-05-20T12:00:45.000Z',
      slotStartMs: 45_000,
      syncedNowMs: 0,
    });

    assert.equal(overlay, null);
    assert.equal(readLockedCountdownTargetMs('match-group:2026-05-20T12:00:45.000Z'), null);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('reservation overlay stays locked to one server instant across the per-render clock ticks', () => {
  resetLockedCountdownTargetForTest();
  const matchId = 'match-duel';
  const slotStartAt = '2026-05-20T12:00:30.000Z';

  try {
    const first = deriveReservationCountdownOverlay({
      matchId,
      slotStartAt,
      slotStartMs: 30_000,
      syncedNowMs: 4_000,
    });
    assert.equal(first?.targetMs, 30_000);
    assert.equal(first?.secondsRemaining, 26);

    // A later gating tick (the synced clock advanced) must NOT move the locked target — only
    // the displayed digit steps down off the frozen server instant.
    const later = deriveReservationCountdownOverlay({
      matchId,
      slotStartAt,
      slotStartMs: 30_000,
      syncedNowMs: 6_100,
    });
    assert.equal(later?.targetMs, 30_000);
    assert.equal(later?.secondsRemaining, 24);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('reservation overlay does NOT lock while the clock is not ready, but still shows the live digit', () => {
  resetLockedCountdownTargetForTest();
  const matchId = 'match-duel';
  const slotStartAt = '2026-05-20T12:00:30.000Z';

  try {
    // clockReady=false: the displayed digit follows the live remaining, but no lock is
    // written, so a skewed phone never freezes a wrong instant during convergence.
    const live = deriveReservationCountdownOverlay({
      matchId,
      slotStartAt,
      slotStartMs: 30_000,
      syncedNowMs: 2_000,
      clockReady: false,
    });
    assert.equal(live?.secondsRemaining, 28);
    assert.equal(readLockedCountdownTargetMs(`${matchId}:${slotStartAt}`), null);

    // Once the clock is ready the lock freezes the (correct) server instant.
    const locked = deriveReservationCountdownOverlay({
      matchId,
      slotStartAt,
      slotStartMs: 30_000,
      syncedNowMs: 3_000,
      clockReady: true,
    });
    assert.equal(locked?.targetMs, 30_000);
    assert.equal(locked?.secondsRemaining, 27);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});
