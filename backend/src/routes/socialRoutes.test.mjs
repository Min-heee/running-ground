import assert from 'node:assert/strict';

import { routeSocialRequest } from './socialRoutes.mjs';

// Deterministic stand-in for lib/inputNormalizers.mjs normalizeImportedRun. The real
// one also rejects dates after "today" (UTC wall clock), which would make fixed
// on/after-launch fixtures flaky around the launch date; its date/shape validation
// has its own coverage in lib/validators.test.mjs. What matters here is that the
// route partitions the NORMALIZED entries (this marker proves normalization ran
// before the cutoff filter) and only then hands survivors to the repository.
function normalizeImportedRunStub(sourceType, rawRun) {
  return {
    sourceType,
    date: rawRun.date,
    distanceKm: rawRun.distanceKm,
    pace: rawRun.pace,
    normalized: true,
  };
}

class TestApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function createMockResponse() {
  return {
    body: undefined,
    statusCode: undefined,
    writeHead(statusCode) {
      this.statusCode = statusCode;
    },
    end(body) {
      this.body = body;
    },
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`[socialRoutes] ok - ${name}`);
  } catch (error) {
    console.error(`[socialRoutes] failed - ${name}`);
    throw error;
  }
}

// Drives the REAL import route (normalizeImportedRun included) with a capturing
// fake repository, so these cases pin the launch-cutoff enforcement point: entries
// dated before 2026-07-13 must be dropped BEFORE the repository queue sees them.
async function postImport(runs) {
  const response = createMockResponse();
  const captured = { normalizedRuns: null, sourceType: null };

  const handled = await routeSocialRequest({
    method: 'POST',
    pathname: '/api/integrations/sources/apple_health/import',
    request: {},
    response,
    sendJson,
    parseJsonBody: async () => ({ runs }),
    normalizeImportedRun: normalizeImportedRunStub,
    getRunsRepository: () => ({
      async queueIntegrationImports({ sourceType, normalizedRuns }) {
        captured.sourceType = sourceType;
        captured.normalizedRuns = normalizedRuns;
        return {
          success: true,
          source: { sourceType, displayName: 'Apple Health', connected: true },
          queuedRuns: normalizedRuns.length,
          pendingRuns: normalizedRuns.length,
        };
      },
    }),
    getAccessToken: () => 'token-user-1',
    ApiError: TestApiError,
  });

  assert.equal(handled, true);

  return { response, captured, payload: JSON.parse(response.body) };
}

const importRun = (date) => ({ date, distanceKm: 5.2, pace: '05:30/km' });

await runTest('import queue drops pre-launch entries before the repository sees them', async () => {
  const { response, captured, payload } = await postImport([
    importRun('2026-07-12'),
    importRun('2026-07-13'),
    importRun('2024-03-01'),
    importRun('2026-07-14'),
  ]);

  assert.equal(response.statusCode, 202);
  assert.deepEqual(captured.normalizedRuns.map((run) => run.date), ['2026-07-13', '2026-07-14']);
  assert.ok(captured.normalizedRuns.every((run) => run.normalized), 'cutoff must run on normalized entries');
  assert.equal(payload.queuedRuns, 2);
  assert.equal(payload.skippedPreLaunch, 2);
});

await runTest('all-pre-launch import queues nothing and reports every entry as skipped', async () => {
  const { response, captured, payload } = await postImport([
    importRun('2020-01-01'),
    importRun('2026-07-12'),
  ]);

  assert.equal(response.statusCode, 202);
  assert.deepEqual(captured.normalizedRuns, []);
  assert.equal(payload.success, true);
  assert.equal(payload.queuedRuns, 0);
  assert.equal(payload.skippedPreLaunch, 2);
});

await runTest('on/after-launch imports pass through untouched with skippedPreLaunch 0', async () => {
  const { captured, payload } = await postImport([
    importRun('2026-07-13'),
    importRun('2026-08-01'),
  ]);

  assert.equal(captured.sourceType, 'apple_health');
  assert.equal(captured.normalizedRuns.length, 2);
  assert.equal(payload.queuedRuns, 2);
  assert.equal(payload.skippedPreLaunch, 0);
});

await runTest('existing response fields stay intact alongside the additive skip count', async () => {
  const { payload } = await postImport([importRun('2026-07-15')]);

  assert.equal(payload.success, true);
  assert.equal(payload.source.sourceType, 'apple_health');
  assert.equal(payload.pendingRuns, 1);
  assert.deepEqual(
    Object.keys(payload).sort(),
    ['pendingRuns', 'queuedRuns', 'skippedPreLaunch', 'source', 'success'],
  );
});
