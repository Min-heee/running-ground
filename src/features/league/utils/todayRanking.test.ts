import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { TodayRankingCategory, TodayRankingResponse } from '@/domain';
import { rankMockTodayEntries } from '@/features/league/utils/mockTodayRanking';
import {
  hasTodayRankingEntries,
  todayRankingCategoryDescriptions,
  todayRankingCategoryLabels,
} from '@/features/league/utils/todayRanking';

describe('today ranking display helpers', () => {
  it('keeps the three today ranking categories user-facing and stable', () => {
    assert.equal(todayRankingCategoryLabels.pace, '페이스');
    assert.equal(todayRankingCategoryLabels.distance, '거리');
    assert.equal(todayRankingCategoryLabels.streak, '일 연속');
    assert.match(todayRankingCategoryDescriptions.streak, /40일/);
  });

  it('detects empty and populated today ranking responses', () => {
    const emptyRanking: TodayRankingResponse = {
      category: 'pace',
      entries: [],
      rankedAt: '2026-05-19T00:00:00.000Z',
      totalCount: 0,
    };
    const populatedRanking: TodayRankingResponse = {
      ...emptyRanking,
      entries: [{
        isCurrentUser: true,
        name: '민병희',
        rank: 1,
        tag: '#BH7K2',
        userId: 'user-me',
        value: '5:00/km',
        valueNumber: 300,
      }],
      totalCount: 1,
    };

    assert.equal(hasTodayRankingEntries(null), false);
    assert.equal(hasTodayRankingEntries(emptyRanking), false);
    assert.equal(hasTodayRankingEntries(populatedRanking), true);
  });

  it('sorts mock today ranking entries by category and marks the current user', () => {
    const categories: TodayRankingCategory[] = ['pace', 'distance', 'streak'];

    for (const category of categories) {
      const entries = rankMockTodayEntries(category, '#BH7K2');
      const values = entries.map((entry) => entry.valueNumber);
      const sortedValues = [...values].sort((left, right) => (
        category === 'pace' ? left - right : right - left
      ));

      assert.deepEqual(values, sortedValues);
      assert.ok(entries.some((entry) => entry.isCurrentUser));
    }
  });
});
