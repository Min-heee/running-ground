import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MEASURING_TICKER_QUIESCE_GRACE_MS,
  MEASURING_TICKER_UPCOMING_WAKE_WINDOW_MS,
  isMeasuringTickerQuiesced,
  shouldEnableCountdownTicker,
} from '@/features/runs/runtime/countdownTickerGate';
import type { CountdownTickerGateInput } from '@/features/runs/runtime/countdownTickerGate';

// ---------------------------------------------------------------------------
// The measuring-phase ticker quiesce must NEVER change the gate around a match
// start (the crash-scarred game-grade countdown funnel), and must reliably
// silence the 1Hz full-tree re-render once measuring is confirmed.
// ---------------------------------------------------------------------------

const NOW_MS = Date.parse('2026-07-03T10:00:00.000Z');

function buildInput(overrides: Partial<CountdownTickerGateInput> = {}): CountdownTickerGateInput {
  return {
    heavyTickersFocusGate: true,
    shouldRunCountdownTicker: true,
    isStarting: false,
    isRunning: false,
    hasHydratedFocusMatch: false,
    hasVisibleCountdownEntry: false,
    hasRoomCountdownEntry: false,
    hasNextStartingMatch: false,
    hasActiveUpcomingMatch: false,
    upcomingMatches: [],
    duelMatchState: null,
    groupMatchState: null,
    matchRoomLinkedMatchId: null,
    matchRoomState: null,
    arenaOpenFired: false,
    arenaOpenAtMs: null,
    freshSyncedNowMs: NOW_MS,
    ...overrides,
  };
}

// The fully-quiesced measuring baseline: run confirmed, arena open fired past
// the grace, nothing upcoming.
function buildQuiescedMeasuringInput(
  overrides: Partial<CountdownTickerGateInput> = {},
): CountdownTickerGateInput {
  return buildInput({
    isRunning: true,
    arenaOpenFired: true,
    arenaOpenAtMs: NOW_MS - MEASURING_TICKER_QUIESCE_GRACE_MS - 1_000,
    ...overrides,
  });
}

test('pre-quiesce behavior is byte-identical: every original ON-term still enables the ticker', () => {
  const onTerms: Partial<CountdownTickerGateInput>[] = [
    { isStarting: true },
    { isRunning: true },
    { hasHydratedFocusMatch: true },
    { hasVisibleCountdownEntry: true },
    { hasRoomCountdownEntry: true },
    { hasNextStartingMatch: true },
    { hasActiveUpcomingMatch: true },
    { upcomingMatches: [{ slotStartAt: '2026-07-03T13:00:00.000Z' }] },
    { duelMatchState: 'matched' },
    { groupMatchState: 'matched' },
    { matchRoomLinkedMatchId: 'room-linked-1' },
    { matchRoomState: 'arming' },
    { matchRoomState: 'countdown' },
  ];

  for (const term of onTerms) {
    assert.equal(
      shouldEnableCountdownTicker(buildInput(term)),
      true,
      `expected ON for ${JSON.stringify(term)}`,
    );
  }
});

test('no ON-term → ticker off (unchanged idle behavior)', () => {
  assert.equal(shouldEnableCountdownTicker(buildInput()), false);
});

test('focus gate / idle-view gate still force the ticker off regardless of terms', () => {
  assert.equal(
    shouldEnableCountdownTicker(buildInput({ heavyTickersFocusGate: false, isRunning: true })),
    false,
  );
  assert.equal(
    shouldEnableCountdownTicker(buildInput({ shouldRunCountdownTicker: false, isRunning: true })),
    false,
  );
});

test('THE PRIZE: measuring past the grace with nothing upcoming quiesces the ticker', () => {
  assert.equal(shouldEnableCountdownTicker(buildQuiescedMeasuringInput()), false);
});

test('grace window: within 30s of the arena open the ticker stays on', () => {
  const input = buildQuiescedMeasuringInput({
    arenaOpenAtMs: NOW_MS - MEASURING_TICKER_QUIESCE_GRACE_MS + 1_000,
  });
  assert.equal(shouldEnableCountdownTicker(input), true);
});

test('quiesce never engages before the arena open fires — the countdown window is untouchable', () => {
  // Mid-countdown shape: running not yet true / arena not open, room counting down.
  assert.equal(
    isMeasuringTickerQuiesced(buildInput({
      isRunning: true,
      arenaOpenFired: false,
      arenaOpenAtMs: null,
    })),
    false,
  );
  // Even with a stale stamp lying around, no arenaOpenFired → no quiesce.
  assert.equal(
    isMeasuringTickerQuiesced(buildInput({
      isRunning: true,
      arenaOpenFired: false,
      arenaOpenAtMs: NOW_MS - 60_000,
    })),
    false,
  );
});

test('always-on terms override the quiesce (next round arming/countdown mid-run wakes the ticker)', () => {
  assert.equal(
    shouldEnableCountdownTicker(buildQuiescedMeasuringInput({ matchRoomState: 'countdown' })),
    true,
  );
  assert.equal(
    shouldEnableCountdownTicker(buildQuiescedMeasuringInput({ matchRoomState: 'arming' })),
    true,
  );
  assert.equal(
    shouldEnableCountdownTicker(buildQuiescedMeasuringInput({ hasVisibleCountdownEntry: true })),
    true,
  );
  assert.equal(
    shouldEnableCountdownTicker(buildQuiescedMeasuringInput({ duelMatchState: 'matched' })),
    true,
  );
});

test('upcoming slot entering the 2min wake window un-quiesces; a far slot does not', () => {
  const soonSlot = new Date(NOW_MS + MEASURING_TICKER_UPCOMING_WAKE_WINDOW_MS - 5_000).toISOString();
  const farSlot = new Date(NOW_MS + MEASURING_TICKER_UPCOMING_WAKE_WINDOW_MS + 60_000).toISOString();

  assert.equal(
    shouldEnableCountdownTicker(buildQuiescedMeasuringInput({
      upcomingMatches: [{ slotStartAt: soonSlot }],
    })),
    true,
  );
  assert.equal(
    shouldEnableCountdownTicker(buildQuiescedMeasuringInput({
      upcomingMatches: [{ slotStartAt: farSlot }],
    })),
    false,
  );
});

test('unparseable upcoming slot stays conservative: ticker keeps running', () => {
  assert.equal(
    shouldEnableCountdownTicker(buildQuiescedMeasuringInput({
      upcomingMatches: [{ slotStartAt: 'not-a-date' }],
    })),
    true,
  );
});

test('monotone: once quiesced, advancing the fresh clock can never flap it back on its own', () => {
  const base = buildQuiescedMeasuringInput();
  for (const aheadMs of [0, 1_000, 10_000, 60_000, 30 * 60_000]) {
    assert.equal(
      shouldEnableCountdownTicker({ ...base, freshSyncedNowMs: NOW_MS + aheadMs }),
      false,
      `flapped back on at +${aheadMs}ms`,
    );
  }
});

test('arena open cleared mid-run (finish/leave) restores the keep-alive gate — safe direction', () => {
  const input = buildQuiescedMeasuringInput({ arenaOpenFired: false, arenaOpenAtMs: null });
  assert.equal(shouldEnableCountdownTicker(input), true);
});

test('idle with a reserved match hours away keeps ticking (original keep-alive preserved)', () => {
  const input = buildInput({
    upcomingMatches: [{ slotStartAt: new Date(NOW_MS + 3 * 3_600_000).toISOString() }],
  });
  assert.equal(shouldEnableCountdownTicker(input), true);
});
