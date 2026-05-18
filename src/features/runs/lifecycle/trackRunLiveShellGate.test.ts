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

test('mounted live match fallback prevents idle shell from blocking active arena remount', () => {
  const decision = resolveTrackRunLiveShellGate({
    matchLifecycleStage: 'active',
    mountedLiveMatchId: 'duel-match-mounted',
    requestedShell: 'idle',
    requestedShouldShowReadyScreen: true,
    routeShellHint: 'live',
    showLiveArena: false,
  });

  assert.equal(decision.routeMatchId, 'duel-match-mounted');
  assert.equal(decision.shellKind, 'live');
  assert.equal(decision.shouldForceLiveShell, true);
  assert.equal(decision.shouldForceLiveArena, true);
  assert.equal(decision.shouldShowReadyScreen, false);
  assert.equal(decision.blockedReason, 'idle-shell-would-block-live-route');
});

test('active linked match fallback forces first live shell mount before registry exists', () => {
  const decision = resolveTrackRunLiveShellGate({
    linkedMatchContext: { matchId: 'duel-match-linked', state: 'active' },
    matchLifecycleStage: 'active',
    requestedShell: 'idle',
    requestedShouldShowReadyScreen: true,
    routeShellHint: 'live',
    showLiveArena: false,
  });

  assert.equal(decision.routeMatchId, 'duel-match-linked');
  assert.equal(decision.shellKind, 'live');
  assert.equal(decision.shouldForceLiveShell, true);
  assert.equal(decision.shouldForceLiveArena, true);
  assert.equal(decision.shouldShowReadyScreen, false);
  assert.equal(decision.blockedReason, 'idle-shell-would-block-live-route');
});

test('matched linked match fallback can force live shell during arming lifecycle', () => {
  const decision = resolveTrackRunLiveShellGate({
    linkedMatchContext: { matchId: 'duel-match-linked', state: 'matched' },
    matchLifecycleStage: 'arming',
    requestedShell: 'lobby',
    requestedShouldShowReadyScreen: true,
    routeShellHint: 'live',
    showLiveArena: false,
  });

  assert.equal(decision.routeMatchId, 'duel-match-linked');
  assert.equal(decision.shellKind, 'live');
  assert.equal(decision.shouldForceLiveShell, true);
  assert.equal(decision.shouldForceLiveArena, true);
  assert.equal(decision.blockedReason, 'lobby-shell-would-block-live-route');
});

test('linked match fallback is ignored outside live lifecycle stages', () => {
  const decision = resolveTrackRunLiveShellGate({
    linkedMatchContext: { matchId: 'duel-match-linked', state: 'matched' },
    matchLifecycleStage: 'waiting',
    requestedShell: 'idle',
    requestedShouldShowReadyScreen: true,
    routeShellHint: 'live',
    showLiveArena: false,
  });

  assert.equal(decision.routeMatchId, null);
  assert.equal(decision.shellKind, 'idle');
  assert.equal(decision.shouldForceLiveShell, false);
  assert.equal(decision.shouldForceLiveArena, false);
});

test('linked match fallback does not replace mounted live match priority', () => {
  const decision = resolveTrackRunLiveShellGate({
    linkedMatchContext: { matchId: 'duel-match-linked', state: 'active' },
    matchLifecycleStage: 'active',
    mountedLiveMatchId: 'duel-match-mounted',
    requestedShell: 'idle',
    requestedShouldShowReadyScreen: true,
    routeShellHint: 'live',
    showLiveArena: false,
  });

  assert.equal(decision.routeMatchId, 'duel-match-mounted');
  assert.equal(decision.shellKind, 'live');
  assert.equal(decision.shouldForceLiveArena, true);
});

test('mounted live match fallback is ignored outside live lifecycle stages', () => {
  const finishedDecision = resolveTrackRunLiveShellGate({
    matchLifecycleStage: 'finished',
    mountedLiveMatchId: 'duel-match-mounted',
    requestedShell: 'idle',
    requestedShouldShowReadyScreen: true,
    routeShellHint: 'live',
    showLiveArena: false,
  });
  const waitingDecision = resolveTrackRunLiveShellGate({
    matchLifecycleStage: 'waiting',
    mountedLiveMatchId: 'duel-match-mounted',
    requestedShell: 'idle',
    requestedShouldShowReadyScreen: true,
    routeShellHint: 'live',
    showLiveArena: false,
  });

  assert.equal(finishedDecision.routeMatchId, null);
  assert.equal(finishedDecision.shellKind, 'idle');
  assert.equal(finishedDecision.shouldForceLiveShell, false);
  assert.equal(finishedDecision.shouldForceLiveArena, false);
  assert.equal(waitingDecision.routeMatchId, null);
  assert.equal(waitingDecision.shellKind, 'idle');
  assert.equal(waitingDecision.shouldForceLiveShell, false);
  assert.equal(waitingDecision.shouldForceLiveArena, false);
});

test('explicit route match id keeps priority over mounted live match fallback', () => {
  const decision = resolveTrackRunLiveShellGate({
    hydratedMatchId: 'duel-match-route',
    linkedMatchContext: { matchId: 'duel-match-linked', state: 'active' },
    matchLifecycleStage: 'active',
    mountedLiveMatchId: 'duel-match-mounted',
    requestedShell: 'lobby',
    requestedShouldShowReadyScreen: true,
    routePreferArena: true,
    routeShellHint: 'live',
    showLiveArena: false,
  });

  assert.equal(decision.routeMatchId, 'duel-match-route');
  assert.equal(decision.shellKind, 'live');
  assert.equal(decision.shouldForceLiveArena, true);
  assert.equal(decision.blockedReason, 'lobby-shell-would-block-live-route');
});
