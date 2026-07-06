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

// Party-duel (room-linked) coverage — the decision is deliberately mode/flow-agnostic, so an
// active PARTY-linked match rides the same rule. The party-specific plumbing around it is:
// arming uses activeLiveMatchProgressMatchId, which falls back to roomLinkedMatchContext.matchId
// (resolveActiveLiveMatchProgressMatchId, locked in trackRunRuntimeDerivedState.test.ts), and the
// fired no-arg loader resolves the party session by focusedDuelMatchIdRef's matchId alone (the
// backend ignores slot/distance when a matchId is present). Stamps cover party applies on BOTH
// paths: the loader stamps linked/blocking/lifeline/resume applies, the funnel applier stamps
// heartbeat/background applies — so a healthy party match keeps the lifeline zero-cost, and only
// a fully wedged foreground GET state (every keyed-slot channel latched) crosses 8s and fires.
test('opponent sync lifeline covers an active party-linked match: fires on a stale stamp, no-ops while party applies stamp', () => {
  // Every party delivery channel silent >8s (e.g. zombie-owner starvation) → fires.
  assert.equal(
    shouldFireOpponentSyncLifeline(buildTickInput({
      lastAppliedMs: BASE_NOW_MS - (OPPONENT_SYNC_LIFELINE_STALE_AFTER_MS + 5_000),
      matchActive: true,
    })),
    true,
  );
  // Healthy party steady state: linked-poll/heartbeat-response applies land every ~2.5s and stamp
  // through the loader/funnel accepted branches — the lifeline stays a no-op.
  assert.equal(
    shouldFireOpponentSyncLifeline(buildTickInput({
      lastAppliedMs: BASE_NOW_MS - 2_500,
      matchActive: true,
    })),
    false,
  );
});
