import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTrackRunLiveShellGate } from '@/features/runs/lifecycle/trackRunLiveShellGate';

test('hydrated live route prevents idle shell from blocking live match mount', () => {
  const decision = resolveTrackRunLiveShellGate({
    hydratedMatchId: 'duel-match-route',
    requestedShell: 'idle',
    requestedShouldShowReadyScreen: true,
    routePreferArena: true,
    routeShellHint: 'live',
    showLiveArena: false,
  });

  assert.equal(decision.shellKind, 'live');
  assert.equal(decision.shouldShowReadyScreen, false);
  assert.equal(decision.shouldForceLiveArena, true);
  assert.equal(decision.blockedReason, 'idle-shell-would-block-live-route');
});

test('lobby shell remains available when route does not target a live match', () => {
  const decision = resolveTrackRunLiveShellGate({
    requestedShell: 'lobby',
    requestedShouldShowReadyScreen: true,
    routeShellHint: 'lobby',
    showLiveArena: false,
  });

  assert.equal(decision.shellKind, 'lobby');
  assert.equal(decision.shouldShowReadyScreen, true);
  assert.equal(decision.shouldForceLiveArena, false);
  assert.equal(decision.blockedReason, null);
});

test('live lifecycle route can force arena while waiting for mount signal', () => {
  const decision = resolveTrackRunLiveShellGate({
    hydratedMatchId: 'group-match-route',
    matchLifecycleStage: 'countdown',
    requestedShell: 'lobby',
    requestedShouldShowReadyScreen: true,
    routeShellHint: 'live',
    showLiveArena: false,
  });

  assert.equal(decision.shellKind, 'live');
  assert.equal(decision.shouldForceLiveArena, true);
  assert.equal(decision.blockedReason, 'lobby-shell-would-block-live-route');
});
