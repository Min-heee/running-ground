import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
  MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
} from '@/lib/matchCountdown';
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
  // Host no longer has a 10s special case — it reveals the digit at the SAME 30s window
  // as every other start mode, so host + guest see the same number at the same t.
  for (const startMode of ['host', 'scheduled', undefined] as const) {
    assert.equal(shouldShowRoomCountdownNumbers({
      remainingSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS + 1,
      startMode,
    }), false, `${startMode ?? 'unset'} should hide just outside the 30s window`);

    assert.equal(shouldShowRoomCountdownNumbers({
      remainingSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
      startMode,
    }), true, `${startMode ?? 'unset'} should reveal at the 30s window edge`);

    // A point that used to be inside the old host-only 10s window also reveals — the
    // host gate is no longer narrower than the guest gate.
    assert.equal(shouldShowRoomCountdownNumbers({
      remainingSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS + 2,
      startMode,
    }), true, `${startMode ?? 'unset'} should reveal well inside the 30s window`);
  }

  // No finite remaining yet (loading) still surfaces (existing behavior).
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

test('host-start local countdown lock persists across handoff remounts by match key', () => {
  resetLockedCountdownTargetForTest();
  const input = {
    key: 'match-1:host-display',
    maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
  };

  try {
    assert.equal(resolveLockedCountdownTarget({
      ...input,
      nowMs: 0,
      rawRemainingSeconds: 10,
    }), 10);

    // Simulates /match-room → running-tab handoff remount: no hook-local ref is
    // carried over, but the same match key keeps the one-second monotonic clamp.
    assert.equal(resolveLockedCountdownTarget({
      ...input,
      nowMs: 1000,
      rawRemainingSeconds: 7,
    }), 9);

    assert.equal(resolveLockedCountdownTarget({
      ...input,
      key: 'match-2:host-display',
      nowMs: 1000,
      rawRemainingSeconds: 7,
    }), 7);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('host-start local countdown exposes the locked local target time', () => {
  resetLockedCountdownTargetForTest();
  const input = {
    key: 'match-1:host-display',
    maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
  };

  try {
    assert.equal(resolveLockedCountdownTarget({
      ...input,
      nowMs: 1_000,
      rawRemainingSeconds: 6,
    }), 6);
    assert.equal(readLockedCountdownTargetMs(input.key), 7_000);
    assert.equal(readLockedCountdownTargetMs('missing:host-display'), null);
    assert.equal(readLockedCountdownTargetMs(null), null);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('host-start local countdown lock keeps ticking after raw countdown ends early', () => {
  resetLockedCountdownTargetForTest();
  const input = {
    key: 'match-1:host-display',
    maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
  };

  try {
    assert.equal(resolveLockedCountdownTarget({
      ...input,
      nowMs: 0,
      rawRemainingSeconds: 5,
    }), 5);

    assert.equal(resolveLockedCountdownTarget({
      ...input,
      nowMs: 1000,
      rawRemainingSeconds: 2,
    }), 4);

    assert.equal(resolveLockedCountdownTarget({
      ...input,
      nowMs: 2000,
      rawRemainingSeconds: null,
    }), 3);

    assert.equal(resolveLockedCountdownTarget({
      ...input,
      nowMs: 4000,
      rawRemainingSeconds: null,
    }), 1);

    assert.equal(resolveLockedCountdownTarget({
      ...input,
      nowMs: 5000,
      rawRemainingSeconds: null,
    }), null);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('host-start lock targets the exact slot instant regardless of lock-tick phase', () => {
  resetLockedCountdownTargetForTest();

  try {
    // Two phones with agreeing clocks cross the 10s gate on different render-tick
    // phases against the SAME slot (at local 10_000ms). Their displayed boundaries must
    // land on the same instants — the old nowMs + raw*1000 quantization put them up to
    // ~1s apart.
    assert.equal(resolveLockedCountdownTarget({
      key: 'phone-a:host-display',
      maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
      nowMs: 0,
      rawRemainingSeconds: 10,
      rawRemainingMs: 10_000,
    }), 10);
    assert.equal(resolveLockedCountdownTarget({
      key: 'phone-b:host-display',
      maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
      nowMs: 480,
      rawRemainingSeconds: 10,
      rawRemainingMs: 9_520,
    }), 10);

    // Both countdowns end at the same local instant (10_000ms): just before it both
    // still show 1, at it both are done.
    assert.equal(resolveLockedCountdownTarget({
      key: 'phone-a:host-display',
      maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
      nowMs: 9_900,
      rawRemainingSeconds: null,
    }), 1);
    assert.equal(resolveLockedCountdownTarget({
      key: 'phone-b:host-display',
      maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
      nowMs: 9_900,
      rawRemainingSeconds: null,
    }), 1);
    assert.equal(resolveLockedCountdownTarget({
      key: 'phone-a:host-display',
      maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
      nowMs: 10_000,
      rawRemainingSeconds: null,
    }), null);
    assert.equal(resolveLockedCountdownTarget({
      key: 'phone-b:host-display',
      maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
      nowMs: 10_000,
      rawRemainingSeconds: null,
    }), null);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('host-start lock re-locks once when the implied slot drifts after a late offset converge', () => {
  resetLockedCountdownTargetForTest();
  const input = {
    key: 'match-relock:host-display',
    maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
  };

  try {
    // Cold lock while the server-clock offset is still converging: raw says 10s.
    assert.equal(resolveLockedCountdownTarget({
      ...input,
      nowMs: 0,
      rawRemainingSeconds: 10,
    }), 10);

    // 1s later the offset has converged (+3s), so the implied slot moved by -3s.
    // The lock corrects ONCE to the accurate target (digit steps down, never up).
    assert.equal(resolveLockedCountdownTarget({
      ...input,
      nowMs: 1000,
      rawRemainingSeconds: 6,
    }), 6);

    // Re-lock is one-shot: later raw swings no longer move the target.
    assert.equal(resolveLockedCountdownTarget({
      ...input,
      nowMs: 2000,
      rawRemainingSeconds: 9,
    }), 5);

    assert.equal(resolveLockedCountdownTarget({
      ...input,
      nowMs: 6000,
      rawRemainingSeconds: null,
    }), 1);

    assert.equal(resolveLockedCountdownTarget({
      ...input,
      nowMs: 7000,
      rawRemainingSeconds: null,
    }), null);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('host-start lock holds through small jitter without re-locking', () => {
  resetLockedCountdownTargetForTest();
  const input = {
    key: 'match-jitter:host-display',
    maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
  };

  try {
    assert.equal(resolveLockedCountdownTarget({
      ...input,
      nowMs: 0,
      rawRemainingSeconds: 10,
    }), 10);

    // +1.0s implied drift is within the jitter tolerance → the lock holds steady.
    assert.equal(resolveLockedCountdownTarget({
      ...input,
      nowMs: 1000,
      rawRemainingSeconds: 10,
    }), 9);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('host-start local countdown lock waits for the visible host window before locking', () => {
  resetLockedCountdownTargetForTest();
  const input = {
    key: 'match-1:host-display',
    maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
  };

  try {
    assert.equal(resolveLockedCountdownTarget({
      ...input,
      nowMs: 0,
      rawRemainingSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS + 1,
    }), null);

    assert.equal(resolveLockedCountdownTarget({
      ...input,
      nowMs: 1000,
      rawRemainingSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
    }), MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('host-start room arming overlay is superseded by the numeric countdown once it shows', () => {
  // Bundle B reveals the countdown digit at the uniform 30s window for every start mode, so
  // the host's poll-in buffer (~12→10s) now shows the centered number instead of the dark
  // arming loader — the arming overlay must YIELD to it (no number-over-loader stack), even
  // while loading is still flagged.
  const whileCountdownVisible = resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    linkedMatchSlotStartAt: '2026-05-20T12:00:12.000Z',
    matchMode: 'duel',
    remainingSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS + 2, // 12s — inside the 30s window
    shouldShowLoading: true,
    startMode: 'host',
    syncedNowMs: Date.parse('2026-05-20T12:00:00.000Z'),
  });
  assert.equal(whileCountdownVisible, false);

  // Before any countdown digit exists (still syncing, no remaining), the arming loader still shows.
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

// ---------------------------------------------------------------------------
// Bundle B — the locked target is now the SINGLE producer for EVERY runtime
// CountdownEntry (party host AND non-host, matched duel, matched group, both
// reservation rooms), keyed by the shared `${matchId}:${slotStartAt}` scheme and
// gated/clamped at the uniform 30s window. These cover the generalized helper that
// every producer (including the duel/group fallback and the reservation rooms) calls.
// ---------------------------------------------------------------------------

test('a duel fallback entry carries a non-null locked target and a stable shared key', () => {
  resetLockedCountdownTargetForTest();
  // The shared key the duel fallback + the room + the reservation room all build for
  // the same match: `${matchId}:${slotStartAt}`.
  const key = 'match-duel:2026-05-20T12:00:30.000Z';

  try {
    // At 28s out (inside the 30s window) the fallback locks: a finite seconds seed AND
    // a non-null absolute targetMs the overlay drives its LOCAL countdown off.
    assert.equal(resolveLockedCountdownTarget({
      key,
      maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
      nowMs: 1_000,
      rawRemainingSeconds: 28,
      rawRemainingMs: 28_000,
    }), 28);

    // Non-null and exactly nowMs + rawRemainingMs (the same absolute instant on any
    // device whose clock agrees), proving the entry no longer emits targetMs:null.
    assert.equal(readLockedCountdownTargetMs(key), 29_000);
    assert.notEqual(readLockedCountdownTargetMs(key), null);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('the locked target is stable across re-renders for one key but re-locks for a new slotStartAt', () => {
  resetLockedCountdownTargetForTest();
  const slotA = 'match-requeue:2026-05-20T12:00:30.000Z';
  // A RE-QUEUED match with a NEW slotStartAt gets a NEW key — so its fresh countdown is
  // never suppressed and locks to its own absolute instant.
  const slotB = 'match-requeue:2026-05-20T12:05:30.000Z';

  try {
    // First lock for slotA at 25s out.
    assert.equal(resolveLockedCountdownTarget({
      key: slotA,
      maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
      nowMs: 0,
      rawRemainingSeconds: 25,
      rawRemainingMs: 25_000,
    }), 25);
    const lockedA = readLockedCountdownTargetMs(slotA);
    assert.equal(lockedA, 25_000);

    // Re-render for the SAME key a moment later with a slightly jittered raw — the
    // target does NOT move (still 25_000), the digit just steps down off the frozen
    // instant.
    assert.equal(resolveLockedCountdownTarget({
      key: slotA,
      maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
      nowMs: 1_000,
      rawRemainingSeconds: 24,
      rawRemainingMs: 24_050,
    }), 24);
    assert.equal(readLockedCountdownTargetMs(slotA), lockedA);

    // A NEW slotStartAt (re-queued) locks a fresh, independent target — not suppressed
    // by the old key's lock.
    assert.equal(resolveLockedCountdownTarget({
      key: slotB,
      maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
      nowMs: 2_000,
      rawRemainingSeconds: 30,
      rawRemainingMs: 30_000,
    }), 30);
    assert.equal(readLockedCountdownTargetMs(slotB), 32_000);
    // The new key's target is distinct from the original.
    assert.notEqual(readLockedCountdownTargetMs(slotB), lockedA);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('the 30s window clamps a far-out duel/group fallback and only locks inside it', () => {
  resetLockedCountdownTargetForTest();
  const key = 'match-window:2026-05-20T12:01:00.000Z';

  try {
    // 31s out (just outside the 30s window): no lock yet, no number.
    assert.equal(resolveLockedCountdownTarget({
      key,
      maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
      nowMs: 0,
      rawRemainingSeconds: 31,
      rawRemainingMs: 31_000,
    }), null);
    assert.equal(readLockedCountdownTargetMs(key), null);

    // At the 30s edge it locks and clamps to the window.
    assert.equal(resolveLockedCountdownTarget({
      key,
      maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
      nowMs: 1_000,
      rawRemainingSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
      rawRemainingMs: 30_000,
    }), MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS);
    assert.equal(readLockedCountdownTargetMs(key), 31_000);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});

test('two phones crossing the 30s window at different tick phases lock to the same instant', () => {
  resetLockedCountdownTargetForTest();

  try {
    // Same slot at local 30_000ms; two phones cross the gate at different render-tick
    // phases. Their locked targets land on the same absolute instant, so every digit
    // boundary (and the end) aligns — the whole point of Bundle B for non-host types.
    assert.equal(resolveLockedCountdownTarget({
      key: 'phone-a:slot',
      maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
      nowMs: 0,
      rawRemainingSeconds: 30,
      rawRemainingMs: 30_000,
    }), 30);
    assert.equal(resolveLockedCountdownTarget({
      key: 'phone-b:slot',
      maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
      nowMs: 470,
      rawRemainingSeconds: 30,
      rawRemainingMs: 29_530,
    }), 30);

    // Both end at the same local instant (30_000ms): just before it both show 1, at it
    // both are done.
    assert.equal(resolveLockedCountdownTarget({
      key: 'phone-a:slot',
      maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
      nowMs: 29_900,
      rawRemainingSeconds: null,
    }), 1);
    assert.equal(resolveLockedCountdownTarget({
      key: 'phone-b:slot',
      maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
      nowMs: 29_900,
      rawRemainingSeconds: null,
    }), 1);
    assert.equal(resolveLockedCountdownTarget({
      key: 'phone-a:slot',
      maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
      nowMs: 30_000,
      rawRemainingSeconds: null,
    }), null);
    assert.equal(resolveLockedCountdownTarget({
      key: 'phone-b:slot',
      maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
      nowMs: 30_000,
      rawRemainingSeconds: null,
    }), null);
  } finally {
    resetLockedCountdownTargetForTest();
  }
});
