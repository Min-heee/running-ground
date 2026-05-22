import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_RANK_STATE,
  formatRankLabel,
  normalizeRankStateForDisplay,
} from './rankDisplay';

test('formatRankLabel renders tier and division', () => {
  assert.equal(formatRankLabel({ tier: '아이언', division: 4, lp: 12 }), '아이언 4');
  assert.equal(formatRankLabel({ tier: '골드', division: 1, lp: 99 }), '골드 1');
});

test('normalizeRankStateForDisplay preserves valid rank state', () => {
  assert.deepEqual(
    normalizeRankStateForDisplay({ tier: '실버', division: 2, lp: 45 }),
    { tier: '실버', division: 2, lp: 45 },
  );
});

test('normalizeRankStateForDisplay falls back for malformed rank state', () => {
  assert.deepEqual(normalizeRankStateForDisplay(undefined), DEFAULT_RANK_STATE);
  assert.deepEqual(normalizeRankStateForDisplay({ tier: '마스터', division: 1, lp: 20 }), DEFAULT_RANK_STATE);
  assert.deepEqual(normalizeRankStateForDisplay({ tier: '브론즈', division: 5, lp: 20 }), DEFAULT_RANK_STATE);
  assert.deepEqual(normalizeRankStateForDisplay({ tier: '브론즈', division: 2, lp: 120 }), DEFAULT_RANK_STATE);
});
