import assert from 'node:assert/strict';

import {
  DEFAULT_IMPORT_MIN_RUN_DATE,
  IMPORT_MIN_RUN_DATE,
  isPreLaunchImportRunDate,
  partitionImportRunsByLaunchCutoff,
  resolveImportMinRunDate,
} from './integrationImportCutoff.mjs';

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`[integrationImportCutoff] ok - ${name}`);
  } catch (error) {
    console.error(`[integrationImportCutoff] failed - ${name}`);
    throw error;
  }
}

await runTest('launch-day default is the KST launch date', () => {
  assert.equal(DEFAULT_IMPORT_MIN_RUN_DATE, '2026-07-13');
});

await runTest('a run dated BEFORE the cutoff is pre-launch', () => {
  assert.equal(isPreLaunchImportRunDate('2026-07-12', DEFAULT_IMPORT_MIN_RUN_DATE), true);
  assert.equal(isPreLaunchImportRunDate('2019-01-01', DEFAULT_IMPORT_MIN_RUN_DATE), true);
});

await runTest('a run dated ON the cutoff is allowed', () => {
  assert.equal(isPreLaunchImportRunDate('2026-07-13', DEFAULT_IMPORT_MIN_RUN_DATE), false);
});

await runTest('a run dated AFTER the cutoff is allowed', () => {
  assert.equal(isPreLaunchImportRunDate('2026-07-14', DEFAULT_IMPORT_MIN_RUN_DATE), false);
  assert.equal(isPreLaunchImportRunDate('2027-01-01', DEFAULT_IMPORT_MIN_RUN_DATE), false);
});

await runTest('missing or malformed dates never sneak past the cutoff', () => {
  assert.equal(isPreLaunchImportRunDate(undefined, DEFAULT_IMPORT_MIN_RUN_DATE), true);
  assert.equal(isPreLaunchImportRunDate(null, DEFAULT_IMPORT_MIN_RUN_DATE), true);
  assert.equal(isPreLaunchImportRunDate('', DEFAULT_IMPORT_MIN_RUN_DATE), true);
});

await runTest('partition drops pre-launch entries, keeps on/after entries in order, and counts skips', () => {
  const runs = [
    { date: '2026-07-12', distanceKm: 5 },
    { date: '2026-07-13', distanceKm: 3 },
    { date: '2024-11-02', distanceKm: 10 },
    { date: '2026-07-14', distanceKm: 7 },
  ];

  const { importableRuns, skippedPreLaunch } = partitionImportRunsByLaunchCutoff(runs, DEFAULT_IMPORT_MIN_RUN_DATE);

  assert.equal(skippedPreLaunch, 2);
  assert.deepEqual(importableRuns.map((run) => run.date), ['2026-07-13', '2026-07-14']);
});

await runTest('partition with only pre-launch entries keeps nothing', () => {
  const { importableRuns, skippedPreLaunch } = partitionImportRunsByLaunchCutoff(
    [{ date: '2025-05-05' }, { date: '2026-07-12' }],
    DEFAULT_IMPORT_MIN_RUN_DATE,
  );

  assert.equal(skippedPreLaunch, 2);
  assert.deepEqual(importableRuns, []);
});

await runTest('valid env override replaces the default cutoff', () => {
  assert.equal(resolveImportMinRunDate('2026-08-01'), '2026-08-01');
  assert.equal(resolveImportMinRunDate('  2026-09-15  '), '2026-09-15');
});

await runTest('invalid env override falls back to the launch-day default', () => {
  for (const invalid of [
    undefined,
    null,
    '',
    '   ',
    'garbage',
    '13-07-2026',
    '2026/07/13',
    '2026-7-13',
    '2026-13-01',
    '2026-02-30',
    '2026-07-13T00:00:00Z',
    20260713,
  ]) {
    assert.equal(
      resolveImportMinRunDate(invalid),
      DEFAULT_IMPORT_MIN_RUN_DATE,
      `expected fallback for ${JSON.stringify(invalid)}`,
    );
  }
});

await runTest('module-level cutoff resolves from BACKEND_IMPORT_MIN_RUN_DATE at load time', async () => {
  assert.equal(IMPORT_MIN_RUN_DATE, resolveImportMinRunDate(process.env.BACKEND_IMPORT_MIN_RUN_DATE));

  const previous = process.env.BACKEND_IMPORT_MIN_RUN_DATE;

  try {
    process.env.BACKEND_IMPORT_MIN_RUN_DATE = '2026-10-01';
    // Query-string import busts the ESM module cache so the constant re-resolves
    // against the overridden env, mirroring a fresh server boot.
    const overridden = await import('./integrationImportCutoff.mjs?env=valid-override');
    assert.equal(overridden.IMPORT_MIN_RUN_DATE, '2026-10-01');

    process.env.BACKEND_IMPORT_MIN_RUN_DATE = 'not-a-date';
    const fallback = await import('./integrationImportCutoff.mjs?env=invalid-override');
    assert.equal(fallback.IMPORT_MIN_RUN_DATE, DEFAULT_IMPORT_MIN_RUN_DATE);
  } finally {
    if (typeof previous === 'string') {
      process.env.BACKEND_IMPORT_MIN_RUN_DATE = previous;
    } else {
      delete process.env.BACKEND_IMPORT_MIN_RUN_DATE;
    }
  }
});
