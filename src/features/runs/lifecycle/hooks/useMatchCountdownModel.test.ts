import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
  MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
} from '@/lib/matchCountdown';
import {
  freezeSlotStartMsForMatch,
  isCountdownKeyFinished,
} from '@/features/runs/lifecycle/countdownLockStore';
import {
  normalizePartyRunFlowRemainingSeconds,
  readLockedCountdownTargetMs,
  resetLockedCountdownTargetForTest,
  resolveLockedCountdownTarget,
  resolveMonotonicCountdownRemainingSeconds,
  resolveShouldShowRoomArmingOverlay,
  resolvePartyRunFlowSyncedNowMs,
  shouldShowRoomCountdownNumbers,
} from './useMatchCountdownModel';

// Convenience: model a render against a fixed slot at an absolute SERVER instant, ticked by
// the SERVER-synced now. This is exactly how every runtime CountdownEntry + both reservation
// rooms call the helper now (the displayed digit ticks the locked server instant against the
// live offset; the lock only freezes once clockReady).
function tick({
  key,
  slotStartMs,
  syncedNowMs,
  clockReady = true,
  maxStartSeconds = MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
}: {
  key: string | null;
  slotStartMs: number | null;
  syncedNowMs: number;
  clockReady?: boolean;
  maxStartSeconds?: number;
}) {
  const rawRemainingMs = slotStartMs !== null ? slotStartMs - syncedNowMs : null;
  const rawRemainingSeconds = rawRemainingMs !== null && rawRemainingMs > 0
    ? Math.max(1, Math.round(rawRemainingMs / 1000))
    : null;
  return resolveLockedCountdownTarget({
    key,
    maxStartSeconds,
    rawRemainingSeconds,
    rawRemainingMs,
    slotStartMs,
    syncedNowMs,
    clockReady,
  });
}

test('room arming overlay HOLDS after the slot elapses when no digit is showing yet (no active)', () => {
  // Behavior change (countdown desync fix): a bare slot-elapsed inference NO LONGER releases
  // the shared 맞추는중/arming hold. A peer whose slot just elapsed but which has no countdown
  // digit yet (cold clock / delayed poll) must STAY held — not skip to active — so both phones
  // count together. The hold is released only by a visible digit OR genuine active.
  const shouldShow = resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    matchMode: 'duel',
    remainingSeconds: null,
    shouldShowLoading: true,
    isMatchActive: false,
  });

  assert.equal(shouldShow, true);
});

test('room arming overlay RELEASES once past the active-inference grace ceiling (stalled-poll trap guard)', () => {
  // Pure-time ceiling: even with no digit and a stale (non-active) room poll, once the synced
  // clock is past slot + ACTIVE_INFERENCE_GRACE the loader MUST release — otherwise a room poll
  // that died across the boundary re-covers a correctly-running arena with no escape. Within the
  // grace the phase is still inferred 'active' (shouldShowLoading false), so this ceiling only
  // ever matters at the re-arm boundary; releasing here cannot re-create the non-host skip.
  const shouldShow = resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    matchMode: 'duel',
    remainingSeconds: null,
    shouldShowLoading: true,
    isMatchActive: false,
    hasLinkedMatchSlotElapsed: true,
  });

  assert.equal(shouldShow, false);
});

test('room arming overlay releases once the match is genuinely active', () => {
  const shouldShow = resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    matchMode: 'duel',
    remainingSeconds: null,
    shouldShowLoading: true,
    isMatchActive: true,
  });

  assert.equal(shouldShow, false);
});

test('room arming overlay keeps existing loading behavior before the linked match slot', () => {
  const shouldShow = resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    matchMode: 'duel',
    shouldShowLoading: true,
    isMatchActive: false,
  });

  assert.equal(shouldShow, true);
});

test('room arming overlay keeps existing behavior when no linked slot is available', () => {
  const shouldShow = resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    matchMode: 'group',
    shouldShowLoading: true,
    isMatchActive: false,
  });

  assert.equal(shouldShow, true);
});

test('room arming overlay remains limited to competitive match modes with loading state', () => {
  assert.equal(resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    matchMode: 'solo',
    shouldShowLoading: true,
    isMatchActive: false,
  }), false);

  assert.equal(resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    matchMode: 'duel',
    shouldShowLoading: false,
    isMatchActive: false,
  }), false);
});

test('every start mode surfaces the numeric countdown at the same uniform 30s window', () => {
  for (const startMode of ['host', 'scheduled', undefined] as const) {
    assert.equal(shouldShowRoomCountdownNumbers({
      remainingSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS + 1,
      startMode,
    }), false, `${startMode ?? 'unset'} should hide just outside the 30s window`);

    assert.equal(shouldShowRoomCountdownNumbers({
      remainingSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
      startMode,
    }), true, `${startMode ?? 'unset'} should reveal at the 30s window edge`);

    assert.equal(shouldShowRoomCountdownNumbers({
      remainingSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS + 2,
      startMode,
    }), true, `${startMode ?? 'unset'} should reveal well inside the 30s window`);
  }

  assert.equal(shouldShowRoomCountdownNumbers({
    remainingSeconds: null,
    startMode: 'host',
  }), true);
});

test('host-start monotonic countdown clamps re-anchor drops to one second at a time', () => {
  const tracker = { current: null };
  const input = {
    key: 'match-1:host-display',
    maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
    tracker,
  };

  assert.equal(resolveMonotonicCountdownRemainingSeconds({
    ...input,
    nowMs: 0,
    rawRemainingSeconds: 10,
  }), 10);

  assert.equal(resolveMonotonicCountdownRemainingSeconds({
    ...input,
    nowMs: 1000,
    rawRemainingSeconds: 8,
  }), 9);

  assert.equal(resolveMonotonicCountdownRemainingSeconds({
    ...input,
    nowMs: 2000,
    rawRemainingSeconds: 7,
  }), 8);

  assert.equal(resolveMonotonicCountdownRemainingSeconds({
    ...input,
    nowMs: 3000,
    rawRemainingSeconds: 7,
  }), 7);
});

test('host-start monotonic countdown never increases after display starts', () => {
  const tracker = { current: null };
  const input = {
    key: 'match-1:host-display',
    maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
    tracker,
  };

  assert.equal(resolveMonotonicCountdownRemainingSeconds({
    ...input,
    nowMs: 0,
    rawRemainingSeconds: 8,
  }), 8);

  assert.equal(resolveMonotonicCountdownRemainingSeconds({
    ...input,
    nowMs: 1000,
    rawRemainingSeconds: 10,
  }), 8);
});

// ---------------------------------------------------------------------------
// The locked target is now the ABSOLUTE SERVER instant (slotStartMs), ticked against the
// SERVER-synced now. The lock is the single producer for EVERY runtime CountdownEntry and
// both reservation rooms, keyed by the shared `${matchId}:${slotStartAt}` scheme.
// ---------------------------------------------------------------------------

test('the lock stores the absolute SERVER instant (slotStartMs), not nowMs+raw', () => {
  resetLockedCountdownTargetForTest();
  const key = 'match-duel:slot';

  try {
    // slot at server-instant 30_000, synced now 2_000 → 28s out.
    assert.equal(tick({ key, slotStartMs: 30_000, syncedNowMs: 2_000 }), 28);
    // The locked target is the server instant itself.
    assert.equal(readLockedCountdownTargetMs(key), 30_000);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('the locked target is stable across re-renders for one key but re-locks for a new slotStartAt', () => {
  resetLockedCountdownTargetForTest();
  const slotA = 'match-requeue:2026-05-20T12:00:30.000Z';
  const slotB = 'match-requeue:2026-05-20T12:05:30.000Z';

  try {
    assert.equal(tick({ key: slotA, slotStartMs: 30_000, syncedNowMs: 5_000 }), 25);
    assert.equal(readLockedCountdownTargetMs(slotA), 30_000);

    // Re-render for the SAME key a moment later: the target does NOT move; the digit steps
    // down off the frozen server instant.
    assert.equal(tick({ key: slotA, slotStartMs: 30_000, syncedNowMs: 6_000 }), 24);
    assert.equal(readLockedCountdownTargetMs(slotA), 30_000);

    // A NEW slotStartAt (re-queued) locks a fresh, independent target.
    assert.equal(tick({ key: slotB, slotStartMs: 330_000, syncedNowMs: 300_000 }), 30);
    assert.equal(readLockedCountdownTargetMs(slotB), 330_000);
    assert.notEqual(readLockedCountdownTargetMs(slotB), readLockedCountdownTargetMs(slotA));
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('the 30s window clamps a far-out duel/group fallback and only locks inside it', () => {
  resetLockedCountdownTargetForTest();
  const key = 'match-window:2026-05-20T12:01:00.000Z';

  try {
    // 31s out (just outside the 30s window): no lock yet, no number.
    assert.equal(tick({ key, slotStartMs: 31_000, syncedNowMs: 0 }), null);
    assert.equal(readLockedCountdownTargetMs(key), null);

    // At the 30s edge it locks and clamps to the window.
    assert.equal(tick({ key, slotStartMs: 31_000, syncedNowMs: 1_000 }), MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS);
    assert.equal(readLockedCountdownTargetMs(key), 31_000);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('the lock keeps ticking the server instant to zero, then ends', () => {
  resetLockedCountdownTargetForTest();
  const key = 'match-end:slot';

  try {
    assert.equal(tick({ key, slotStartMs: 5_000, syncedNowMs: 0 }), 5);
    assert.equal(tick({ key, slotStartMs: 5_000, syncedNowMs: 4_100 }), 1);
    // At/after the instant the countdown ends (and the key is tombstoned).
    assert.equal(tick({ key, slotStartMs: 5_000, syncedNowMs: 5_000 }), null);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

// --- clockReady gating ---

test('the lock is NOT written while the clock is not ready, but the live digit still shows', () => {
  resetLockedCountdownTargetForTest();
  const key = 'match-notready:slot';

  try {
    // clockReady=false: digit follows the live remaining, but NO lock is written.
    assert.equal(tick({ key, slotStartMs: 30_000, syncedNowMs: 2_000, clockReady: false }), 28);
    assert.equal(readLockedCountdownTargetMs(key), null);

    // Still no lock a tick later while not ready.
    assert.equal(tick({ key, slotStartMs: 30_000, syncedNowMs: 3_000, clockReady: false }), 27);
    assert.equal(readLockedCountdownTargetMs(key), null);

    // Once ready, the FIRST ready render freezes the (correct) server instant.
    assert.equal(tick({ key, slotStartMs: 30_000, syncedNowMs: 4_000, clockReady: true }), 26);
    assert.equal(readLockedCountdownTargetMs(key), 30_000);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('two phones with different DEVICE-clock skew but the same slot + converged offset compute the SAME digit each tick', () => {
  resetLockedCountdownTargetForTest();

  // The slot is server-shared (identical on both phones): an absolute server instant.
  const slotStartMs = 1_000_000;

  // Phone A's device clock is ~6s ahead of the server; phone B's is ~3s behind. Once the
  // shared offset has CONVERGED, each phone's getSyncedNowMs() (Date.now()+offset) reads the
  // SAME server time — that is the whole point of the offset. So we model both phones reading
  // the SAME syncedNowMs sequence (their device skew is exactly cancelled by their offset).
  // The lock stores slotStartMs and the digit ticks slotStartMs - syncedNowMs, so both phones
  // produce identical digits at every tick.
  const keyA = 'phone-a:slot';
  const keyB = 'phone-b:slot';

  try {
    for (let syncedNowMs = 970_000; syncedNowMs <= 1_000_000; syncedNowMs += 1_000) {
      const a = tick({ key: keyA, slotStartMs, syncedNowMs, clockReady: true });
      const b = tick({ key: keyB, slotStartMs, syncedNowMs, clockReady: true });
      assert.equal(a, b, `phones diverged at syncedNowMs=${syncedNowMs}: ${a} vs ${b}`);
    }
    // Both ended on the same final instant.
    assert.equal(tick({ key: keyA, slotStartMs, syncedNowMs: 1_000_000, clockReady: true }), null);
    assert.equal(tick({ key: keyB, slotStartMs, syncedNowMs: 1_000_000, clockReady: true }), null);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('a tombstoned key never re-locks at 0 — the one-frame re-offer cannot re-flash a digit', () => {
  resetLockedCountdownTargetForTest();
  const key = 'match-tomb:slot';

  try {
    // Lock, then run to zero → finished (tombstoned).
    assert.equal(tick({ key, slotStartMs: 5_000, syncedNowMs: 0 }), 5);
    assert.equal(tick({ key, slotStartMs: 5_000, syncedNowMs: 5_000 }), null);
    assert.equal(isCountdownKeyFinished(key), true);

    // The model re-offers the SAME just-finished match for a frame (e.g. a slot still ~3s
    // out by a momentarily-stale clock): the tombstone suppresses it — no fresh lock, no
    // re-flashed digit.
    assert.equal(tick({ key, slotStartMs: 5_000, syncedNowMs: 2_000 }), null);
    assert.equal(readLockedCountdownTargetMs(key), null);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('a slotStartAt re-stamp on an already-observed match does NOT rotate the key', () => {
  resetLockedCountdownTargetForTest();
  const matchId = 'match-restamp';

  try {
    // First observation freezes slotStartMs for this matchId.
    const frozen = freezeSlotStartMsForMatch(matchId, 30_000);
    assert.equal(frozen, 30_000);

    // A later status echo re-stamps the slot a touch later (e.g. +1.4s). The frozen value
    // wins, so the countdownKey (`${matchId}:${slotStartAt}`) stays addressed to the SAME
    // instant — no key rotation → no fresh lock → no re-flash.
    assert.equal(freezeSlotStartMsForMatch(matchId, 31_400), 30_000);
    assert.equal(freezeSlotStartMsForMatch(matchId, 28_600), 30_000);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('party run flow remaining seconds are bucketed by lifecycle thresholds', () => {
  assert.equal(normalizePartyRunFlowRemainingSeconds(59), 60);
  assert.equal(normalizePartyRunFlowRemainingSeconds(29), 30);
  assert.equal(normalizePartyRunFlowRemainingSeconds(10), 20);
  assert.equal(normalizePartyRunFlowRemainingSeconds(90), 61);
  assert.equal(normalizePartyRunFlowRemainingSeconds(null), null);
});

test('party run flow synced time only changes when a linked slot has elapsed', () => {
  const room = {
    linkedMatchSlotStartAt: '2026-05-20T12:00:00.000Z',
    slotStartAt: '2026-05-20T12:00:00.000Z',
  } as Parameters<typeof resolvePartyRunFlowSyncedNowMs>[0]['room'];

  assert.equal(resolvePartyRunFlowSyncedNowMs({
    room,
    remainingSeconds: 10,
    syncedNowMs: Date.parse('2026-05-20T11:59:50.000Z'),
  }), null);

  assert.equal(resolvePartyRunFlowSyncedNowMs({
    room,
    remainingSeconds: null,
    syncedNowMs: Date.parse('2026-05-20T11:59:59.000Z'),
  }), null);

  assert.equal(resolvePartyRunFlowSyncedNowMs({
    room,
    remainingSeconds: null,
    syncedNowMs: Date.parse('2026-05-20T12:00:03.000Z'),
  }), Date.parse('2026-05-20T12:00:00.000Z') + 1);
});

test('host-start room arming overlay is superseded by the numeric countdown once it shows', () => {
  const whileCountdownVisible = resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    matchMode: 'duel',
    remainingSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS + 2,
    shouldShowLoading: true,
    startMode: 'host',
    isMatchActive: false,
  });
  assert.equal(whileCountdownVisible, false);

  const whileStillSyncing = resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    matchMode: 'duel',
    remainingSeconds: null,
    shouldShowLoading: true,
    startMode: 'host',
    isMatchActive: false,
  });
  assert.equal(whileStillSyncing, true);
});

// ---------------------------------------------------------------------------
// Countdown desync fix (A + D): the live digit must appear off a server slot REGARDLESS of
// clockReady (clockReady gates ONLY the precise freeze), and a FIRST observation that is
// already <=0 must NOT tombstone the key — only a countdown that genuinely counted down does.
// ---------------------------------------------------------------------------

test('A: with clockReady=false but a slot in-window, a live digit shows and NO lock is written', () => {
  resetLockedCountdownTargetForTest();
  const key = 'match-desync:slot';

  try {
    // Non-host with a cold clock (clockReady=false): the slot is server-authoritative and in
    // window, so the digit MUST be returned (not null) and ticks off the live offset...
    assert.equal(tick({ key, slotStartMs: 28_000, syncedNowMs: 0, clockReady: false }), 28);
    // ...but the precise FREEZE is gated on clockReady, so NO lock is written yet.
    assert.equal(readLockedCountdownTargetMs(key), null);

    assert.equal(tick({ key, slotStartMs: 28_000, syncedNowMs: 18_000, clockReady: false }), 10);
    assert.equal(readLockedCountdownTargetMs(key), null);

    // Once the clock is trusted, the FIRST ready render freezes the (now-correct) server instant.
    assert.equal(tick({ key, slotStartMs: 28_000, syncedNowMs: 20_000, clockReady: true }), 8);
    assert.equal(readLockedCountdownTargetMs(key), 28_000);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('D: a FIRST observation already <=0 returns null WITHOUT tombstoning the key', () => {
  resetLockedCountdownTargetForTest();
  const key = 'match-first-elapsed:slot';

  try {
    // The very first time we see this key the slot has already elapsed (e.g. momentarily stale
    // clock). No lock had ever been frozen → return null but do NOT tombstone, so the key can
    // still count down once it re-enters the window.
    assert.equal(resolveLockedCountdownTarget({
      key,
      maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
      rawRemainingSeconds: null,
      rawRemainingMs: -500,
      slotStartMs: 9_500,
      syncedNowMs: 10_000,
      clockReady: true,
    }), null);
    assert.equal(isCountdownKeyFinished(key), false);

    // It re-enters the window (clock corrected): the digit appears and a lock can freeze.
    assert.equal(tick({ key, slotStartMs: 40_000, syncedNowMs: 15_000, clockReady: true }), 25);
    assert.equal(readLockedCountdownTargetMs(key), 40_000);
    assert.equal(isCountdownKeyFinished(key), false);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('D: a key that FROZE then reaches 0 DOES tombstone', () => {
  resetLockedCountdownTargetForTest();
  const key = 'match-froze-then-zero:slot';

  try {
    // Freeze a lock (clockReady) and count down...
    assert.equal(tick({ key, slotStartMs: 5_000, syncedNowMs: 0, clockReady: true }), 5);
    assert.equal(readLockedCountdownTargetMs(key), 5_000);
    assert.equal(isCountdownKeyFinished(key), false);

    // ...then reach 0: the countdown genuinely finished → tombstone.
    assert.equal(tick({ key, slotStartMs: 5_000, syncedNowMs: 5_000, clockReady: true }), null);
    assert.equal(isCountdownKeyFinished(key), true);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

// ---------------------------------------------------------------------------
// Arming hold (C1): hold while no slot/digit is available; release on a visible digit OR active.
// ---------------------------------------------------------------------------

test('C1: arming overlay HOLDS when no countdown digit is available yet, releases on a digit', () => {
  // No digit (remainingSeconds null) + not active → HOLD.
  assert.equal(resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    matchMode: 'group',
    remainingSeconds: null,
    shouldShowLoading: true,
    isMatchActive: false,
  }), true);

  // A digit is now available (in the 30s window) → RELEASE.
  assert.equal(resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    matchMode: 'group',
    remainingSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
    shouldShowLoading: true,
    isMatchActive: false,
  }), false);

  // Genuinely active → RELEASE even with no digit.
  assert.equal(resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    matchMode: 'group',
    remainingSeconds: null,
    shouldShowLoading: true,
    isMatchActive: true,
  }), false);
});
