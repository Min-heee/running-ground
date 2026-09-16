import { WEEKLY_STREAK_MIN_WEEK_DISTANCE_KM } from './points.mjs';
import { getFriendIds } from './socialStoreHelpers.mjs';
import { findUserById, getUserMetrics } from './userStoreHelpers.mjs';
import {
  compareFriendRank,
  getDistrictBattle,
} from './rankingBuilders.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// 주간 거리 목표 — 홈 '이번 주' 카드의 달성률 기준 (오너 2026-09-16 카드 부활 때 이름 붙임).
const WEEKLY_GOAL_KM = 50;

export function buildHomeSummaryWithMetrics(store, user, metrics) {
  const latestRun = metrics.latestRun;
  const friendUsers = getFriendIds(store, user.id)
    .map((friendId) => findUserById(store, friendId))
    .sort((left, right) => compareFriendRank(store, left, right));
  const closestFriend = friendUsers[0] ?? null;
  const districtBattle = getDistrictBattle(store, user);
  const closestFriendMetrics = closestFriend ? getUserMetrics(store, closestFriend.id) : null;

  return {
    totalDistanceKm: metrics.currentWeekDistanceKm,
    totalRuns: metrics.currentWeekRunCount,
    goalAchievementRate: Math.min(100, Math.round((metrics.currentWeekDistanceKm / WEEKLY_GOAL_KM) * 100)),
    // 홈 '이번 주' 카드가 '목표 50km'라고 적을 때 그 숫자를 여기서 받는다 — 클라 문구와
    // 서버 달성률 기준이 절대 어긋나지 않게 (weeklyStreakMinWeekDistanceKm와 같은 규칙).
    weeklyGoalKm: WEEKLY_GOAL_KM,
    previousWeekDistanceKm: metrics.previousWeekDistanceKm,
    streakDays: metrics.currentStreakDays,
    // 주 연속 러닝 뱃지 (오너 2026-09-01) — 서버 파생 표시값, 포인트 없음. 문턱은 서버가
    // 내려보내 클라 안내 문구와 절대 어긋나지 않게 한다.
    weeklyStreakWeeks: metrics.currentWeeklyStreakWeeks,
    bestWeeklyStreakWeeks: metrics.bestWeeklyStreakWeeks,
    weeklyStreakRanThisWeek: metrics.weeklyStreakRanThisWeek,
    weeklyStreakMinWeekDistanceKm: WEEKLY_STREAK_MIN_WEEK_DISTANCE_KM,
    latestRun: latestRun
      ? {
        distanceKm: latestRun.distanceKm,
        source: latestRun.source,
      }
      : {
        distanceKm: 0,
        source: 'Manual',
      },
    friendName: closestFriend?.name ?? '친구를 추가해보세요',
    friendGapKm: closestFriendMetrics ? Number(Math.abs(closestFriendMetrics.currentWeekDistanceKm - metrics.currentWeekDistanceKm).toFixed(1)) : 0,
    districtName: user.districtName,
    districtRank: districtBattle.homeDistrictRank,
    districtPoints: metrics.currentWeekPoints,
    districtBattle: {
      myDistrict: user.districtName,
      averageDistancePerMember: districtBattle.averageDistancePerMember,
      totalDistanceKm: districtBattle.totalDistanceKm,
      participationRate: districtBattle.participationRate,
      districtRank: districtBattle.districtRank,
    },
  };
}

export function buildMyActivityWithRunsAndMetrics(runs, metrics) {
  return {
    runs: runs.map((run) => ({
      id: run.id,
      date: run.date,
      distanceKm: run.distanceKm,
      pace: run.pace,
      source: run.source,
      ...(run.sourceType ? { sourceType: run.sourceType } : {}),
      ...(run.matchResult ? { matchResult: clone(run.matchResult) } : {}),
    })),
    monthlyDistanceKm: metrics.currentMonthDistanceKm,
    monthlyPoints: metrics.currentMonthPoints,
  };
}
