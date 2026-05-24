import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_RANK_STATE,
  formatRankLabel,
  normalizeRankStateForDisplay,
} from './rankDisplay';

test('formatRankLabel renders tier only', () => {
  assert.equal(formatRankLabel({ tier: '입문', lp: 12 }), '입문');
  assert.equal(formatRankLabel({ tier: '페이서', lp: 99 }), '페이서');
});

test('normalizeRankStateForDisplay preserves valid rank state', () => {
  assert.deepEqual(
    normalizeRankStateForDisplay({ tier: '러너', lp: 45 }),
    { tier: '러너', lp: 45 },
  );
});

test('normalizeRankStateForDisplay falls back for malformed rank state', () => {
  assert.deepEqual(normalizeRankStateForDisplay(undefined), DEFAULT_RANK_STATE);
  assert.deepEqual(normalizeRankStateForDisplay({ tier: '마스터', lp: 20 }), DEFAULT_RANK_STATE);
  assert.deepEqual(normalizeRankStateForDisplay({ tier: '조거', division: 2, lp: 20 }), DEFAULT_RANK_STATE);
  assert.deepEqual(normalizeRankStateForDisplay({ tier: '조거', lp: -1 }), DEFAULT_RANK_STATE);
});
