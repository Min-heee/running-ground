import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLiveMatchShellKey,
  resolveLiveMatchShellPreservation,
} from '@/features/runs/lifecycle/liveMatchShellPreservation';

test('same match route state changes keep the LiveMatchShell key stable', () => {
  const first = resolveLiveMatchShellPreservation({
    currentMatchId: 'duel-match-1',
    currentMode: 'duel',
    isCurrentUserForfeited: false,
    previous: null,
    requestedShowLiveArena: true,
    stage: 'countdown',
  });
  const next = resolveLiveMatchShellPreservation({
    currentMatchId: 'duel-match-1',
    currentMode: 'duel',
    isCurrentUserForfeited: false,
    previous: first.next,
    requestedShowLiveArena: true,
    stage: 'active',
  });

  assert.equal(first.key, buildLiveMatchShellKey('duel-match-1'));
  assert.equal(next.key, first.key);
  assert.equal(next.shouldRenderLiveArena, true);
});

test('GPS or tracking transition does not drop the LiveMatchShell for the same active match', () => {
  const previous = {
    key: buildLiveMatchShellKey('duel-match-2'),
    matchId: 'duel-match-2',
    mode: 'duel' as const,
  };
  const next = resolveLiveMatchShellPreservation({
    currentMatchId: 'duel-match-2',
    currentMode: 'duel',
    isCurrentUserForfeited: false,
    previous,
    requestedShowLiveArena: false,
    stage: 'active',
  });

  assert.equal(next.preserved, true);
  assert.equal(next.key, previous.key);
  assert.equal(next.shouldRenderLiveArena, true);
});

test('finished match stage releases the previous LiveMatchShell key', () => {
  const previous = {
    key: buildLiveMatchShellKey('duel-match-finished'),
    matchId: 'duel-match-finished',
    mode: 'duel' as const,
  };
  const next = resolveLiveMatchShellPreservation({
    currentMatchId: 'duel-match-finished',
    currentMode: 'duel',
    isCurrentUserForfeited: false,
    previous,
    requestedShowLiveArena: false,
    stage: 'finished',
  });

  assert.equal(next.preserved, false);
  assert.equal(next.next, null);
  assert.equal(next.shouldRenderLiveArena, false);
});

test('deferred heavy content changes keep the same LiveMatchShell key for the same match', () => {
  const previous = resolveLiveMatchShellPreservation({
    currentMatchId: 'duel-match-defer',
    currentMode: 'duel',
    isCurrentUserForfeited: false,
    previous: null,
    requestedShowLiveArena: true,
    stage: 'countdown',
  }).next;
  const hydrated = resolveLiveMatchShellPreservation({
    currentMatchId: 'duel-match-defer',
    currentMode: 'duel',
    isCurrentUserForfeited: false,
    previous,
    requestedShowLiveArena: true,
    stage: 'active',
  });

  assert.equal(hydrated.key, previous?.key);
  assert.equal(hydrated.shouldRenderLiveArena, true);
});

test('a different match releases the previous LiveMatchShell key', () => {
  const previous = {
    key: buildLiveMatchShellKey('duel-match-old'),
    matchId: 'duel-match-old',
    mode: 'duel' as const,
  };
  const next = resolveLiveMatchShellPreservation({
    currentMatchId: 'duel-match-new',
    currentMode: 'duel',
    isCurrentUserForfeited: false,
    previous,
    requestedShowLiveArena: false,
    stage: 'waiting',
  });

  assert.equal(next.preserved, false);
  assert.equal(next.key, buildLiveMatchShellKey('duel-match-new'));
  assert.equal(next.shouldRenderLiveArena, false);
});
