import assert from 'node:assert/strict';
import test from 'node:test';

import type { DuelVerdict } from '@/lib/api/types';
import { resolveEstimatedMatchLpDelta, resolveLatchedDuelVerdict } from './useMatchResultController';

test('resolveEstimatedMatchLpDelta keeps official LP but hides party-run LP', () => {
  const winningDuelResult = {
    mode: 'duel' as const,
    title: '승리',
    summary: '상대를 이겼어요.',
    badgeLabel: 'WIN',
    resultTone: 'win' as const,
  };

  assert.equal(resolveEstimatedMatchLpDelta({ trackedMatchResult: winningDuelResult }), 20);
  assert.equal(resolveEstimatedMatchLpDelta({ isPartyRun: true, trackedMatchResult: winningDuelResult }), 0);
});

function verdict(overrides: Partial<DuelVerdict> = {}): DuelVerdict {
  return {
    resolved: true,
    winnerUserId: 'me-user',
    outcome: 'win',
    myFinishElapsedSeconds: 300,
    opponentFinishElapsedSeconds: 360,
    myPaceLabel: '5:00/km',
    opponentPaceLabel: '6:00/km',
    ...overrides,
  };
}

const pendingVerdict: DuelVerdict = {
  resolved: false,
  winnerUserId: null,
  outcome: 'pending',
  myFinishElapsedSeconds: 300,
  opponentFinishElapsedSeconds: null,
  myPaceLabel: '5:00/km',
  opponentPaceLabel: null,
};

test('F4 latch: a resolved duel verdict latches and survives a later pending poll', () => {
  // First poll resolves to a WIN — latch it.
  const first = resolveLatchedDuelVerdict({
    matchMode: 'duel',
    latchedVerdict: null,
    latchedOpponentId: 'opp',
    currentOpponentId: 'opp',
    incomingVerdict: verdict({ outcome: 'win', winnerUserId: 'me-user' }),
  });
  assert.equal(first.latchedVerdict?.outcome, 'win');
  assert.equal(first.effectiveVerdict?.outcome, 'win');

  // A later poll near the boundary briefly returns pending — the latch holds the WIN.
  const second = resolveLatchedDuelVerdict({
    matchMode: 'duel',
    latchedVerdict: first.latchedVerdict,
    latchedOpponentId: 'opp',
    currentOpponentId: 'opp',
    incomingVerdict: pendingVerdict,
  });
  assert.equal(second.effectiveVerdict?.outcome, 'win');
  assert.equal(second.effectiveVerdict?.resolved, true);
});

test('F4 latch: a latched verdict can never flip to a different resolved outcome', () => {
  const latched = verdict({ outcome: 'win', winnerUserId: 'me-user' });
  // Even if a stale response now claims a LOSE, the latched WIN wins.
  const next = resolveLatchedDuelVerdict({
    matchMode: 'duel',
    latchedVerdict: latched,
    latchedOpponentId: 'opp',
    currentOpponentId: 'opp',
    incomingVerdict: verdict({ outcome: 'lose', winnerUserId: 'opp-user' }),
  });
  assert.equal(next.effectiveVerdict?.outcome, 'win');
  assert.equal(next.effectiveVerdict?.winnerUserId, 'me-user');
});

test('F4 latch: a pending verdict does NOT latch (stays free to resolve later)', () => {
  const next = resolveLatchedDuelVerdict({
    matchMode: 'duel',
    latchedVerdict: null,
    latchedOpponentId: 'opp',
    currentOpponentId: 'opp',
    incomingVerdict: pendingVerdict,
  });
  assert.equal(next.latchedVerdict, null);
  assert.equal(next.effectiveVerdict?.outcome, 'pending');
});

test('F4 latch: a new opponent (new match) drops the latch so a fresh duel starts clean', () => {
  const latched = verdict({ outcome: 'win', winnerUserId: 'me-user' });
  const next = resolveLatchedDuelVerdict({
    matchMode: 'duel',
    latchedVerdict: latched,
    latchedOpponentId: 'opp-1',
    currentOpponentId: 'opp-2',
    incomingVerdict: pendingVerdict,
  });
  // Latch cleared; the new duel is pending again.
  assert.equal(next.latchedVerdict, null);
  assert.equal(next.effectiveVerdict?.outcome, 'pending');
});
