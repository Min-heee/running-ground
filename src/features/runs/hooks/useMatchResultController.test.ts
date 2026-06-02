import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveEstimatedMatchLpDelta } from './useMatchResultController';

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
