import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OPPONENT_SYNC_LIFELINE_STALE_AFTER_MS,
  shouldFireOpponentSyncLifeline,
} from '@/features/runs/runtime/opponentSyncLifeline';

const BASE_NOW_MS = 1_751_000_000_000;

function buildTickInput(overrides: Partial<Parameters<typeof shouldFireOpponentSyncLifeline>[0]> = {}) {
  return {
    appStateActive: true,
    inFlight: false,
    // 10s since the last accepted apply — past the 8s stale threshold.
    lastAppliedMs: BASE_NOW_MS - 10_000,
    matchActive: true,
    nowMs: BASE_NOW_MS,
    ...overrides,
  };
}

test('opponent sync lifeline fires when the stamp is stale >8s, match active, app foregrounded', () => {
  assert.equal(shouldFireOpponentSyncLifeline(buildTickInput()), true);
});

test('opponent sync lifeline skips while the stamp is fresh (healthy applies keep it no-op)', () => {
  // Heartbeat applies land every ~2.5s, so a healthy channel keeps the stamp well inside 8s.
  assert.equal(
    shouldFireOpponentSyncLifeline(buildTickInput({ lastAppliedMs: BASE_NOW_MS - 2_500 })),
    false,
  );
  // Exactly AT the threshold is still fresh — only strictly-greater staleness fires.
  assert.equal(
    shouldFireOpponentSyncLifeline(buildTickInput({
      lastAppliedMs: BASE_NOW_MS - OPPONENT_SYNC_LIFELINE_STALE_AFTER_MS,
    })),
    false,
  );
  assert.equal(
    shouldFireOpponentSyncLifeline(buildTickInput({
      lastAppliedMs: BASE_NOW_MS - OPPONENT_SYNC_LIFELINE_STALE_AFTER_MS - 1,
    })),
    true,
  );
});

test('opponent sync lifeline skips while the app is backgrounded', () => {
  // The background flush/applier owns opponent delivery while backgrounded.
  assert.equal(shouldFireOpponentSyncLifeline(buildTickInput({ appStateActive: false })), false);
});

test('opponent sync lifeline skips when no duel/group match is active', () => {
  assert.equal(shouldFireOpponentSyncLifeline(buildTickInput({ matchActive: false })), false);
});

test('opponent sync lifeline never stacks fetches while one is in flight', () => {
  assert.equal(shouldFireOpponentSyncLifeline(buildTickInput({ inFlight: true })), false);
});
