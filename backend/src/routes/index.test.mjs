import assert from 'node:assert/strict';
import { createApiRouteHandler } from './index.mjs';

class TestApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function createMockResponse() {
  return {
    body: undefined,
    ended: false,
    headers: undefined,
    statusCode: undefined,
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
      this.ended = true;
    },
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function createRouteRequest(overrides = {}) {
  return createApiRouteHandler({
    ApiError: TestApiError,
    buildHealthStatus: () => ({
      statusCode: 200,
      payload: { status: 'ok' },
    }),
    sendJson,
    buildHomeSummaryReadPayload: async () => ({ user: { nickname: '테스터' } }),
    ...overrides,
  });
}

async function test(name, run) {
  try {
    await run();
    console.log(`[routes/index] ok - ${name}`);
  } catch (error) {
    console.error(`[routes/index] fail - ${name}`);
    throw error;
  }
}

await test('serves health checks before feature routes', async () => {
  const response = createMockResponse();
  await createRouteRequest()(
    { method: 'GET', url: '/api/health', headers: { host: 'localhost' } },
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { status: 'ok' });
});

await test('responds to preflight requests without routing', async () => {
  const response = createMockResponse();
  await createRouteRequest()(
    { method: 'OPTIONS', url: '/api/home/summary', headers: { host: 'localhost' } },
    response,
  );

  assert.equal(response.statusCode, 204);
  assert.equal(response.ended, true);
});

await test('delegates feature routes to the split route files', async () => {
  const response = createMockResponse();
  await createRouteRequest()(
    { method: 'GET', url: '/api/home/summary', headers: { host: 'localhost' } },
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { user: { nickname: '테스터' } });
});

await test('throws a typed 404 for unknown APIs', async () => {
  await assert.rejects(
    () => createRouteRequest()(
      { method: 'GET', url: '/api/missing', headers: { host: 'localhost' } },
      createMockResponse(),
    ),
    (error) => error instanceof TestApiError
      && error.statusCode === 404
      && error.message === '요청한 API를 찾을 수 없어.',
  );
});
