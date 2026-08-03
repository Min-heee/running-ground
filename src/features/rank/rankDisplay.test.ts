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

test('normalizeRankStateForDisplay maps legacy jogger tier to runner', () => {
  assert.deepEqual(
    normalizeRankStateForDisplay({ tier: '조거', lp: 20 }),
    { tier: '러너', lp: 20 },
  );
});

test('normalizeRankStateForDisplay falls back for malformed rank state', () => {
  assert.deepEqual(normalizeRankStateForDisplay(undefined), DEFAULT_RANK_STATE);
  assert.deepEqual(normalizeRankStateForDisplay({ tier: '마스터', lp: 20 }), DEFAULT_RANK_STATE);
  assert.deepEqual(normalizeRankStateForDisplay({ tier: '조거', division: 2, lp: 20 }), DEFAULT_RANK_STATE);
  assert.deepEqual(normalizeRankStateForDisplay({ tier: '조거', lp: -1 }), DEFAULT_RANK_STATE);
});

// 조기 평가 회귀 가드: 이 모듈은 _layout의 백그라운드 체인으로 테마 하이드레이션 전에
// 평가된다. 티어 색 맵이 값을 굳히면(캡처) 다크 전환이 안 먹으므로, 팔레트 전환을
// 접근 시점에 따라가는지 고정한다.
test('tier color maps follow palette switches (no early value capture)', async () => {
  const { applyThemePalette, DEFAULT_THEME_MODE, getThemePalettesForTest } = await import('@/theme/tokens');
  const { RANK_TIER_COLOR, RANK_TIER_SOFT_COLOR } = await import('./rankDisplay');
  const { light, dark } = getThemePalettesForTest();

  try {
    applyThemePalette('dark');
    assert.equal(RANK_TIER_SOFT_COLOR['입문'], dark.rankIntroSoft);
    assert.equal(RANK_TIER_COLOR['엘리트'], dark.rankEliteAccent);
    assert.notEqual(RANK_TIER_SOFT_COLOR['입문'], light.rankIntroSoft);

    applyThemePalette('light');
    assert.equal(RANK_TIER_SOFT_COLOR['입문'], light.rankIntroSoft);
    assert.equal(RANK_TIER_COLOR['입문'], light.rankIntroAccent);
  } finally {
    applyThemePalette(DEFAULT_THEME_MODE);
  }
});
