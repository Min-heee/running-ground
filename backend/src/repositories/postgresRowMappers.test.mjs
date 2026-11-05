import assert from 'node:assert/strict';
import { mapRunRow as mapRunsRepositoryRunRow } from './postgresRunsRowMappers.mjs';
import { mapRunRow as mapFriendsRepositoryRunRow } from './postgresFriendsRowMappers.mjs';

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`[postgresRowMappers] ok - ${name}`);
  } catch (error) {
    console.error(`[postgresRowMappers] failed - ${name}`);
    throw error;
  }
}

// node-postgres parses timestamptz columns into Date objects (no custom type parser is
// registered), so the mappers must accept Dates — not only the strings the fake databases use.
function buildRunRow(overrides = {}) {
  return {
    id: 'run-1',
    user_id: 'user-1',
    run_date: '2026-11-05',
    distance_km: '5.00',
    pace: '5:00/km',
    started_at: new Date('2026-11-05T06:00:00.000Z'),
    ended_at: new Date('2026-11-05T06:25:00.000Z'),
    imported_at: new Date('2026-11-05T07:00:00.000Z'),
    created_at: new Date('2026-11-05T07:00:00.000Z'),
    updated_at: new Date('2026-11-05T07:00:00.000Z'),
    ...overrides,
  };
}

for (const [label, mapRunRow] of [
  ['runs repository', mapRunsRepositoryRunRow],
  ['friends repository', mapFriendsRepositoryRunRow],
]) {
  await runTest(`${label} mapRunRow keeps Date-typed started/ended/imported timestamps`, () => {
    const run = mapRunRow(buildRunRow());
    assert.equal(run.startedAt, '2026-11-05T06:00:00.000Z');
    assert.equal(run.endedAt, '2026-11-05T06:25:00.000Z');
    assert.equal(run.importedAt, '2026-11-05T07:00:00.000Z');
  });

  await runTest(`${label} mapRunRow still accepts string timestamps and omits null ones`, () => {
    const run = mapRunRow(buildRunRow({
      started_at: '2026-11-05T06:00:00.000Z',
      ended_at: null,
      imported_at: null,
    }));
    assert.equal(run.startedAt, '2026-11-05T06:00:00.000Z');
    assert.equal('endedAt' in run, false);
    assert.equal('importedAt' in run, false);
  });
}

console.log('[postgresRowMappers] all tests passed');
