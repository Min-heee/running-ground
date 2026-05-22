import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  MatchLifecycleController,
  MatchLifecycleStage,
} from '@/features/runs/lifecycle/matchLifecycleController';
import {
  resolveActiveMatchSlotStartAt,
  shouldRunSlotElapsedTicker,
} from './trackingSessionMatchSlot';

function controller(overrides: Partial<MatchLifecycleController> = {}): MatchLifecycleController {
  return {
    stage: 'active',
    mode: 'duel',
    source: 'party-room',
    roomId: 'room-1',
    matchId: 'match-1',
    shouldPreferArena: true,
    effects: {
      shouldPollRoom: false,
      shouldPollDirectMatchStatus: false,
      shouldPollLinkedMatch: true,
      shouldRefreshUpcomingMatches: true,
      shouldAcknowledgeCountdownReady: false,
      shouldNavigateLinkedMatch: false,
      shouldStartGpsWarmup: false,
      shouldStartGpsActive: false,
      shouldRunHeartbeat: true,
    },
    gps: {
      warmupMatch: null,
      activeMatch: {
        matchId: 'match-1',
        mode: 'duel',
        slotStartAt: '2026-05-20T13:49:58.259Z',
      },
    },
    ...overrides,
  };
}

test('active match slot resolves from lifecycle controller active GPS target', () => {
  const slotStartAt = '2026-05-20T13:49:58.259Z';

  const resolved = resolveActiveMatchSlotStartAt(controller({
    gps: {
      warmupMatch: null,
      activeMatch: {
        matchId: 'match-1',
        mode: 'duel',
        slotStartAt,
      },
    },
  }));

  assert.equal(resolved, slotStartAt);
});

test('active match slot returns null when active controller has no active GPS target', () => {
  const resolved = resolveActiveMatchSlotStartAt(controller({
    gps: {
      warmupMatch: null,
      activeMatch: null,
    },
  }));

  assert.equal(resolved, null);
});

test('active match slot returns null before lifecycle reaches active stage', () => {
  for (const stage of ['arming', 'countdown', 'waiting'] satisfies MatchLifecycleStage[]) {
    assert.equal(resolveActiveMatchSlotStartAt(controller({ stage })), null);
  }
});

test('active match slot returns null without a lifecycle controller', () => {
  assert.equal(resolveActiveMatchSlotStartAt(undefined), null);
});

test('slot elapsed ticker runs by default when an active match slot exists', () => {
  assert.equal(shouldRunSlotElapsedTicker({
    activeMatchSlotStartAt: '2026-05-20T13:49:58.259Z',
  }), true);
});

test('slot elapsed ticker does not run when focus gate disables it', () => {
  assert.equal(shouldRunSlotElapsedTicker({
    activeMatchSlotStartAt: '2026-05-20T13:49:58.259Z',
    enabled: false,
  }), false);
});

test('slot elapsed ticker does not run without an active match slot', () => {
  assert.equal(shouldRunSlotElapsedTicker({
    activeMatchSlotStartAt: null,
  }), false);
});
