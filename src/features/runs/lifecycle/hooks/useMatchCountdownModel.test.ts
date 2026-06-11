import assert from 'node:assert/strict';
import test from 'node:test';

import { MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS } from '@/lib/matchCountdown';
import {
  normalizePartyRunFlowRemainingSeconds,
  readPersistentHostStartCountdownTargetMs,
  resetPersistentHostStartCountdownForTest,
  resolveMonotonicCountdownRemainingSeconds,
  resolvePersistentHostStartCountdownRemainingSeconds,
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

test('host-start room countdown numbers stay hidden until the final shared 10 seconds', () => {
  assert.equal(shouldShowRoomCountdownNumbers({
    remainingSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS + 2,
    startMode: 'host',
  }), false);

  assert.equal(shouldShowRoomCountdownNumbers({
    remainingSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
    startMode: 'host',
  }), true);
});

test('scheduled room countdown numbers keep the existing wider countdown window', () => {
  assert.equal(shouldShowRoomCountdownNumbers({
    remainingSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS + 20,
    startMode: 'scheduled',
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
  resetPersistentHostStartCountdownForTest();
  const input = {
    key: 'match-1:host-display',
    maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
  };

  try {
    assert.equal(resolvePersistentHostStartCountdownRemainingSeconds({
      ...input,
      nowMs: 0,
      rawRemainingSeconds: 10,
    }), 10);

    // Simulates /match-room → running-tab handoff remount: no hook-local ref is
    // carried over, but the same match key keeps the one-second monotonic clamp.
    assert.equal(resolvePersistentHostStartCountdownRemainingSeconds({
      ...input,
      nowMs: 1000,
      rawRemainingSeconds: 7,
    }), 9);

    assert.equal(resolvePersistentHostStartCountdownRemainingSeconds({
      ...input,
      key: 'match-2:host-display',
      nowMs: 1000,
      rawRemainingSeconds: 7,
    }), 7);
  } finally {
    resetPersistentHostStartCountdownForTest();
  }
});

test('host-start local countdown exposes the locked local target time', () => {
  resetPersistentHostStartCountdownForTest();
  const input = {
    key: 'match-1:host-display',
    maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
  };

  try {
    assert.equal(resolvePersistentHostStartCountdownRemainingSeconds({
      ...input,
      nowMs: 1_000,
      rawRemainingSeconds: 6,
    }), 6);
    assert.equal(readPersistentHostStartCountdownTargetMs(input.key), 7_000);
    assert.equal(readPersistentHostStartCountdownTargetMs('missing:host-display'), null);
    assert.equal(readPersistentHostStartCountdownTargetMs(null), null);
  } finally {
    resetPersistentHostStartCountdownForTest();
  }
});

test('host-start local countdown lock keeps ticking after raw countdown ends early', () => {
  resetPersistentHostStartCountdownForTest();
  const input = {
    key: 'match-1:host-display',
    maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
  };

  try {
    assert.equal(resolvePersistentHostStartCountdownRemainingSeconds({
      ...input,
      nowMs: 0,
      rawRemainingSeconds: 5,
    }), 5);

    assert.equal(resolvePersistentHostStartCountdownRemainingSeconds({
      ...input,
      nowMs: 1000,
      rawRemainingSeconds: 2,
    }), 4);

    assert.equal(resolvePersistentHostStartCountdownRemainingSeconds({
      ...input,
      nowMs: 2000,
      rawRemainingSeconds: null,
    }), 3);

    assert.equal(resolvePersistentHostStartCountdownRemainingSeconds({
      ...input,
      nowMs: 4000,
      rawRemainingSeconds: null,
    }), 1);

    assert.equal(resolvePersistentHostStartCountdownRemainingSeconds({
      ...input,
      nowMs: 5000,
      rawRemainingSeconds: null,
    }), null);
  } finally {
    resetPersistentHostStartCountdownForTest();
  }
});

test('host-start lock re-locks once when the implied slot drifts after a late offset converge', () => {
  resetPersistentHostStartCountdownForTest();
  const input = {
    key: 'match-relock:host-display',
    maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
  };

  try {
    // Cold lock while the server-clock offset is still converging: raw says 10s.
    assert.equal(resolvePersistentHostStartCountdownRemainingSeconds({
      ...input,
      nowMs: 0,
      rawRemainingSeconds: 10,
    }), 10);

    // 1s later the offset has converged (+3s), so the implied slot moved by -3s.
    // The lock corrects ONCE to the accurate target (digit steps down, never up).
    assert.equal(resolvePersistentHostStartCountdownRemainingSeconds({
      ...input,
      nowMs: 1000,
      rawRemainingSeconds: 6,
    }), 6);

    // Re-lock is one-shot: later raw swings no longer move the target.
    assert.equal(resolvePersistentHostStartCountdownRemainingSeconds({
      ...input,
      nowMs: 2000,
      rawRemainingSeconds: 9,
    }), 5);

    assert.equal(resolvePersistentHostStartCountdownRemainingSeconds({
      ...input,
      nowMs: 6000,
      rawRemainingSeconds: null,
    }), 1);

    assert.equal(resolvePersistentHostStartCountdownRemainingSeconds({
      ...input,
      nowMs: 7000,
      rawRemainingSeconds: null,
    }), null);
  } finally {
    resetPersistentHostStartCountdownForTest();
  }
});

test('host-start lock holds through small jitter without re-locking', () => {
  resetPersistentHostStartCountdownForTest();
  const input = {
    key: 'match-jitter:host-display',
    maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
  };

  try {
    assert.equal(resolvePersistentHostStartCountdownRemainingSeconds({
      ...input,
      nowMs: 0,
      rawRemainingSeconds: 10,
    }), 10);

    // +1.0s implied drift is within the jitter tolerance → the lock holds steady.
    assert.equal(resolvePersistentHostStartCountdownRemainingSeconds({
      ...input,
      nowMs: 1000,
      rawRemainingSeconds: 10,
    }), 9);
  } finally {
    resetPersistentHostStartCountdownForTest();
  }
});

test('host-start local countdown lock waits for the visible host window before locking', () => {
  resetPersistentHostStartCountdownForTest();
  const input = {
    key: 'match-1:host-display',
    maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
  };

  try {
    assert.equal(resolvePersistentHostStartCountdownRemainingSeconds({
      ...input,
      nowMs: 0,
      rawRemainingSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS + 1,
    }), null);

    assert.equal(resolvePersistentHostStartCountdownRemainingSeconds({
      ...input,
      nowMs: 1000,
      rawRemainingSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
    }), MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS);
  } finally {
    resetPersistentHostStartCountdownForTest();
  }
});

test('host-start room arming overlay covers the poll-in buffer before numeric countdown', () => {
  const shouldShow = resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    linkedMatchSlotStartAt: '2026-05-20T12:00:12.000Z',
    matchMode: 'duel',
    remainingSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS + 2,
    shouldShowLoading: false,
    startMode: 'host',
    syncedNowMs: Date.parse('2026-05-20T12:00:00.000Z'),
  });

  assert.equal(shouldShow, true);
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
