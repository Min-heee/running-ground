import assert from 'node:assert/strict';

import { buildUserRunMetrics, getRunPointBreakdown, getRunPointValue } from './lib/points.mjs';
import { buildMatchRunnerProfile } from './lib/runningMatchSession/matchSessionSnapshots.mjs';
import { cleanupLegacyIntegrationSources } from './lib/integrationSourceMigrations.mjs';

function runTest(name, testFn) {
  try {
    testFn();
    console.log(`[points] ok - ${name}`);
  } catch (error) {
    console.error(`[points] failed - ${name}`);
    throw error;
  }
}

const NOW = new Date('2026-07-10T12:00:00');

function trackedRun(id, date, distanceKm, extra = {}) {
  return {
    id,
    date,
    distanceKm,
    pace: '06:00/km',
    source: 'RunningGround',
    sourceType: 'runningground',
    ...extra,
  };
}

function importedRun(id, date, distanceKm, extra = {}) {
  return {
    id,
    date,
    distanceKm,
    pace: '05:00/km',
    source: 'Apple Health',
    sourceType: 'apple_health',
    ...extra,
  };
}

// ── 적립 차단 (2026-07-12): imported runs mint NO points ────────────────────────

runTest('an imported run has no point entry and earns 0', () => {
  const metrics = buildUserRunMetrics([importedRun('import-1', '2026-07-06', 12)], NOW);

  assert.equal(getRunPointValue(metrics, 'import-1'), 0);
  assert.deepEqual(getRunPointBreakdown(metrics, 'import-1'), {
    levelPoints: 0,
    streakPoints: 0,
    growthPoints: 0,
    matchBonusPoints: 0,
    totalPoints: 0,
  });
  assert.equal(metrics.currentWeekPoints, 0);
  assert.equal(metrics.currentMonthPoints, 0);
  assert.equal(metrics.totalEarnedPoints, 0);
});

runTest('imported runs still count in personal display metrics', () => {
  const metrics = buildUserRunMetrics([importedRun('import-1', '2026-07-06', 12)], NOW);

  assert.equal(metrics.currentWeekDistanceKm, 12);
  assert.equal(metrics.lifetimeDistanceKm, 12);
  assert.equal(metrics.distanceLevel, 1);
  assert.equal(metrics.currentWeekRunCount, 1);
  // ...but not in the competitive aggregates.
  assert.equal(metrics.competitiveWeekDistanceKm, 0);
  assert.equal(metrics.competitiveLifetimeDistanceKm, 0);
  assert.equal(metrics.competitiveDistanceLevel, 0);
});

runTest('the level ladder for points climbs on competitive distance only', () => {
  // 8km import then 3km tracked: the ALL-runs cumulative crosses 10km on the
  // tracked run, but the competitive ladder is only at 3km — no level bonus.
  const metrics = buildUserRunMetrics([
    importedRun('import-1', '2026-07-06', 8),
    trackedRun('tracked-1', '2026-07-07', 3),
  ], NOW);

  assert.equal(getRunPointBreakdown(metrics, 'tracked-1').levelPoints, 0);
  assert.equal(metrics.distanceLevel, 1);
  assert.equal(metrics.competitiveDistanceLevel, 0);

  // The same 3km after 8km of TRACKED history does cross the ladder.
  const trackedOnly = buildUserRunMetrics([
    trackedRun('tracked-0', '2026-07-06', 8),
    trackedRun('tracked-1', '2026-07-07', 3),
  ], NOW);
  assert.equal(getRunPointBreakdown(trackedOnly, 'tracked-1').levelPoints, 10);
});

runTest('imported days extend the display streak but never earn streak points', () => {
  // Three consecutive qualifying days: tracked, imported, tracked.
  const metrics = buildUserRunMetrics([
    trackedRun('tracked-1', '2026-07-08', 5),
    importedRun('import-1', '2026-07-09', 5),
    trackedRun('tracked-2', '2026-07-10', 5),
  ], NOW);

  // Personal display streak counts all three days.
  assert.equal(metrics.currentStreakDays, 3);
  // Points streak sees only the two tracked days with a gap between them —
  // each restarts at day 1, so no consecutive reward is minted.
  assert.equal(getRunPointBreakdown(metrics, 'tracked-1').streakPoints, 0);
  assert.equal(getRunPointBreakdown(metrics, 'tracked-2').streakPoints, 0);
  assert.equal(getRunPointBreakdown(metrics, 'import-1').streakPoints, 0);

  // The same three days fully tracked DO mint streak points on days 2 and 3.
  const trackedOnly = buildUserRunMetrics([
    trackedRun('tracked-1', '2026-07-08', 5),
    trackedRun('tracked-2', '2026-07-09', 5),
    trackedRun('tracked-3', '2026-07-10', 5),
  ], NOW);
  assert.equal(getRunPointBreakdown(trackedOnly, 'tracked-2').streakPoints, 1);
  assert.equal(getRunPointBreakdown(trackedOnly, 'tracked-3').streakPoints, 3);
});

runTest('growth points compare competitive weeks only', () => {
  // Last week: 5km tracked. This week: 2km tracked + 10km imported.
  // Full distance grew (12 > 5) but competitive distance shrank (2 < 5) —
  // no growth bonus may be minted.
  const metrics = buildUserRunMetrics([
    trackedRun('tracked-last-week', '2026-06-30', 5),
    trackedRun('tracked-this-week', '2026-07-07', 2),
    importedRun('import-this-week', '2026-07-08', 10),
  ], NOW);

  assert.equal(getRunPointBreakdown(metrics, 'tracked-this-week').growthPoints, 0);
  assert.equal(getRunPointBreakdown(metrics, 'import-this-week').growthPoints, 0);

  // Competitive growth still mints: 5km → 6km tracked.
  const grown = buildUserRunMetrics([
    trackedRun('tracked-last-week', '2026-06-30', 5),
    trackedRun('tracked-this-week', '2026-07-07', 6),
  ], NOW);
  assert.equal(getRunPointBreakdown(grown, 'tracked-this-week').growthPoints, 10);
});

runTest('match bonuses survive the competitive-only lattice', () => {
  const metrics = buildUserRunMetrics([
    trackedRun('duel-win', '2026-07-07', 3, {
      matchResult: { mode: 'duel', resultTone: 'win' },
    }),
  ], NOW);

  assert.equal(getRunPointBreakdown(metrics, 'duel-win').matchBonusPoints, 20);
  // 20 duel-win bonus + 10 growth (first competitive week: 0km → 3km).
  assert.equal(metrics.currentWeekPoints, 30);
});

// ── Match runner profile is competitive-only ───────────────────────────────────

function createProfileStore(user, runs) {
  return { users: [user], runs };
}

runTest('the match runner profile ignores imported runs', () => {
  const user = { id: 'user-1', name: '러너', publicTag: '#RUN01', districtName: '일산서구' };
  // getUserMetrics inside the profile builder runs on the REAL clock, so the
  // fixture must use today's date for the weekly aggregates to be non-empty.
  // IMPORTANT: the metrics pipeline (points.mjs parseRunDate/getDateKey) works on
  // the LOCAL clock, so build the key from local getters — toISOString() is the
  // UTC date and lags by a day between local midnight and UTC midnight (e.g. KST
  // Monday 00:00-09:00), which would drop the run into "last week".
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  // Newest first (the profile reads the head of the list as the latest run).
  const runs = [
    importedRun('import-1', today, 20, { pace: '04:00/km', userId: user.id }),
    trackedRun('tracked-1', today, 5, { pace: '06:30/km', userId: user.id }),
  ];
  const store = createProfileStore(user, runs);

  const profile = buildMatchRunnerProfile(store, user, runs);

  // Pace comes from the tracked run only — the fabricated-fast import is ignored.
  assert.equal(profile.averagePaceMinutes, 6.5);
  assert.equal(profile.latestDistanceKm, 5);
  // Weekly/lifetime/level are the competitive aggregates.
  assert.equal(profile.weeklyDistanceKm, 5);
  assert.equal(profile.lifetimeDistanceKm, 5);
  assert.equal(profile.distanceLevel, 0);
});

runTest('an import-only user keeps neutral fallbacks and stays matchable', () => {
  const user = { id: 'user-2', name: '워치러너', publicTag: '#RUN02', districtName: '일산서구' };
  const importsOnly = [importedRun('import-1', '2026-07-09', 20, { pace: '04:00/km' })];
  const profile = buildMatchRunnerProfile(createProfileStore(user, importsOnly), user, importsOnly);

  assert.equal(profile.averagePaceMinutes, 5.5);
  assert.equal(profile.latestDistanceKm, 0);
  assert.equal(profile.weeklyDistanceKm, 0);
  assert.equal(profile.lifetimeDistanceKm, 0);
});

// ── Legacy integration-source cleanup ─────────────────────────────────────────

runTest('cleanupLegacyIntegrationSources strips mynb and disconnects hidden brands', () => {
  const store = {
    users: [
      {
        id: 'u1',
        connectedSources: [
          { sourceType: 'apple_health', connected: true, connectionStatus: 'connected' },
          { sourceType: 'mynb', connected: true, connectionStatus: 'connected' },
          // A legacy connected brand row: invisible in the hub-only selector,
          // so it must be force-disconnected (kept as a pristine planned row).
          { sourceType: 'nrc', connected: true, connectionStatus: 'connected', lastSyncedAt: '2026-07-01T00:00:00.000Z' },
        ],
      },
      { id: 'u2', connectedSources: [{ sourceType: 'strava', connected: false, connectionStatus: 'planned' }] },
      { id: 'u3' },
    ],
  };

  assert.equal(cleanupLegacyIntegrationSources(store), true);
  // mynb removed entirely; the hub connection untouched.
  assert.deepEqual(store.users[0].connectedSources, [
    { sourceType: 'apple_health', connected: true, connectionStatus: 'connected' },
    { sourceType: 'nrc', connected: false, connectionStatus: 'planned' },
  ]);
  // Already-pristine brand rows report no change.
  assert.deepEqual(store.users[1].connectedSources, [
    { sourceType: 'strava', connected: false, connectionStatus: 'planned' },
  ]);
  // Idempotent: second run reports no change.
  assert.equal(cleanupLegacyIntegrationSources(store), false);
});

// ── 친구 랭킹 오늘/이번 달 실측 집계 + KST 앵커 (2026-07-21) ─────────────────────

runTest('per-window competitive aggregates are real sums and exclude imports', () => {
  const runs = [
    trackedRun('t-lastmonth', '2026-06-28', 7),
    trackedRun('t-month', '2026-07-02', 2),
    trackedRun('t-today', '2026-07-10', 3),
    importedRun('i-today', '2026-07-10', 11),
  ];
  const metrics = buildUserRunMetrics(runs, NOW);

  assert.equal(metrics.competitiveTodayDistanceKm, 3);
  assert.equal(metrics.competitiveMonthDistanceKm, 5);
  assert.equal(metrics.competitiveWeekDistanceKm, 3);
  // Personal month total keeps the import (display-only surfaces).
  assert.equal(metrics.currentMonthDistanceKm, 16);
  // Today's run minted level(10, crossing 12km cumulative) + weekly growth(10).
  assert.equal(metrics.todayPoints, 20);
  assert.equal(metrics.currentMonthPoints, 20);
});

runTest('zero runs today stays zero — no fabricated floor', () => {
  const metrics = buildUserRunMetrics([trackedRun('t-old', '2026-07-06', 10)], NOW);

  assert.equal(metrics.competitiveTodayDistanceKm, 0);
  assert.equal(metrics.todayPoints, 0);
});

runTest('KST anchor: today/week/month resolve on the Korea calendar on a UTC clock', () => {
  // 2026-07-20 16:30 UTC = 2026-07-21 01:30 KST. A run saved "tonight" in Korea
  // carries date 2026-07-21; server-local anchoring on the UTC droplet put the
  // anchor a day behind and reported today=0 between 00:00 and 09:00 KST.
  const utcNightKstEarlyMorning = new Date('2026-07-20T16:30:00Z');
  const metrics = buildUserRunMetrics(
    [trackedRun('t-kst', '2026-07-21', 4)],
    utcNightKstEarlyMorning,
  );

  assert.equal(metrics.competitiveTodayDistanceKm, 4);
  assert.equal(metrics.competitiveWeekDistanceKm, 4);
  assert.equal(metrics.competitiveMonthDistanceKm, 4);
  // First-ever run: weekly growth bonus (4km > 0km previous week) lands today.
  assert.equal(metrics.todayPoints, 10);
});
