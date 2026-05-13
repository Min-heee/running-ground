import assert from 'node:assert/strict';
import test from 'node:test';

import type { MyRunRecord, WeeklySummary } from '@/domain';
import { buildWeeklyPointOverview } from '@/features/points/pointSystem';
import {
  buildPointTrack,
  getConsecutiveRewardPoints,
  getMinimumRunDistanceForStreak,
} from '@/features/points/utils/pointRewards';

const summary: WeeklySummary = {
  totalDistanceKm: 12,
  totalRuns: 3,
  goalAchievementRate: 80,
  previousWeekDistanceKm: 10,
  streakDays: 0,
  latestRun: {
    distanceKm: 4,
    source: 'RunningGround',
  },
  friendName: '테스트',
  friendGapKm: 1,
  districtName: '일산서구',
  districtRank: 1,
  districtPoints: 10,
  districtBattle: {
    myDistrict: '일산서구',
    averageDistancePerMember: 3,
    totalDistanceKm: 120,
    participationRate: 30,
    districtRank: 1,
  },
};

test('weekly point overview keeps distance level, growth, and streak tracks stable', () => {
  const runs: MyRunRecord[] = [
    { id: 'run-1', date: '2026-05-11', distanceKm: 3, pace: '6:00/km', source: 'phone' },
    { id: 'run-2', date: '2026-05-12', distanceKm: 3.1, pace: '6:00/km', source: 'phone' },
  ];
  const overview = buildWeeklyPointOverview(summary, {
    lifetimeDistanceKm: 21.2,
    runs,
    currentDate: new Date('2026-05-13T12:00:00'),
  });

  assert.equal(overview.distanceLevel, 2);
  assert.equal(overview.distanceLevelPoints, 20);
  assert.equal(overview.previousWeekDistanceKm, 10);
  assert.equal(overview.improvementDistanceKm, 2);
  assert.deepEqual(overview.tracks.map((track) => track.id), ['distance', 'streak', 'growth']);
  assert.equal(overview.tracks.find((track) => track.id === 'growth')?.achieved, true);
  assert.equal(overview.tracks.find((track) => track.id === 'streak')?.calendar?.currentStreakDays, 2);
});

test('weekly point overview handles zero-distance summaries safely', () => {
  const overview = buildWeeklyPointOverview({
    ...summary,
    totalDistanceKm: 0,
    totalRuns: 0,
    previousWeekDistanceKm: 0,
    latestRun: {
      distanceKm: 0,
      source: 'RunningGround',
    },
  }, {
    lifetimeDistanceKm: 0,
    runs: [],
    currentDate: new Date('2026-05-13T12:00:00'),
  });

  assert.equal(overview.distanceLevel, 0);
  assert.equal(overview.distanceLevelPoints, 0);
  assert.equal(overview.lifetimeDistanceKm, 0);
  assert.equal(overview.improvementDistanceKm, 0);
  assert.equal(overview.tracks.find((track) => track.id === 'distance')?.progressPercent, 0);
  assert.equal(overview.tracks.find((track) => track.id === 'growth')?.achieved, false);
});

test('point reward helpers keep streak thresholds and progress math stable', () => {
  assert.equal(getConsecutiveRewardPoints(-1), 0);
  assert.equal(getConsecutiveRewardPoints(1), 0);
  assert.equal(getConsecutiveRewardPoints(2), 1);
  assert.equal(getConsecutiveRewardPoints(5), 7);
  assert.equal(getMinimumRunDistanceForStreak(19), 3);
  assert.equal(getMinimumRunDistanceForStreak(20), 5);

  assert.deepEqual(buildPointTrack({
    id: 'growth',
    label: '성장',
    scope: 'weekly',
    currentValue: 12,
    targetValue: 10,
    unit: 'km',
    rewardPoints: 10,
    helperText: '테스트',
    statusText: '완료',
  }), {
    id: 'growth',
    label: '성장',
    scope: 'weekly',
    currentValue: 12,
    targetValue: 10,
    unit: 'km',
    rewardPoints: 10,
    helperText: '테스트',
    statusText: '완료',
    achieved: true,
    progressPercent: 100,
  });
});
