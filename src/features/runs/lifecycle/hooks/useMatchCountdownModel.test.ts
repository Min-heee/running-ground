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

test('room arming overlay stays hidden after the linked match slot elapsed', () => {
  const shouldShow = resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    linkedMatchSlotStartAt: '2026-05-20T12:00:00.000Z',
    matchMode: 'duel',
    shouldShowLoading: true,
    syncedNowMs: Date.parse('2026-05-20T12:02:01.000Z'),
  });

  assert.equal(shouldShow, false);
});

test('room arming overlay keeps existing loading behavior before the linked match slot', () => {
  const shouldShow = resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    linkedMatchSlotStartAt: '2026-05-20T12:00:00.000Z',
    matchMode: 'duel',
    shouldShowLoading: true,
    syncedNowMs: Date.parse('2026-05-20T11:59:50.000Z'),
  });

  assert.equal(shouldShow, true);
});

test('room arming overlay keeps existing behavior when no linked slot is available', () => {
  const shouldShow = resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    linkedMatchSlotStartAt: null,
    matchMode: 'group',
    shouldShowLoading: true,
    syncedNowMs: Date.parse('2026-05-20T12:02:01.000Z'),
  });

  assert.equal(shouldShow, true);
});

test('room arming overlay remains limited to competitive match modes with loading state', () => {
  assert.equal(resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    linkedMatchSlotStartAt: '2026-05-20T12:05:00.000Z',
    matchMode: 'solo',
    shouldShowLoading: true,
    syncedNowMs: Date.parse('2026-05-20T12:00:00.000Z'),
  }), false);

  assert.equal(resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    linkedMatchSlotStartAt: '2026-05-20T12:05:00.000Z',
    matchMode: 'duel',
    shouldShowLoading: false,
    syncedNowMs: Date.parse('2026-05-20T12:00:00.000Z'),
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
    linkedMatchSlotStartAt: '2026-05-20T12:00:12.000Z',
    matchMode: 'duel',
    remainingSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS + 2,
    shouldShowLoading: true,
    startMode: 'host',
    syncedNowMs: Date.parse('2026-05-20T12:00:00.000Z'),
  });
  assert.equal(whileCountdownVisible, false);

  const whileStillSyncing = resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    linkedMatchSlotStartAt: '2026-05-20T12:00:40.000Z',
    matchMode: 'duel',
    remainingSeconds: null,
    shouldShowLoading: true,
    startMode: 'host',
    syncedNowMs: Date.parse('2026-05-20T12:00:00.000Z'),
  });
  assert.equal(whileStillSyncing, true);
});
