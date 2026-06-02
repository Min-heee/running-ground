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

await test('serves authenticated opponent match profile without private fields', async () => {
  const response = createMockResponse();
  const store = {
    sessions: [{ token: 'token', userId: 'viewer' }],
    users: [
      {
        id: 'viewer',
        name: '조회자',
        publicTag: 'viewer',
        districtName: '일산서구',
        connectedSources: [],
      },
      {
        id: 'opponent-user',
        name: '상대 러너',
        realName: '비공개 실명',
        phoneNumber: '01012345678',
        passwordHash: 'secret',
        publicTag: 'oppo',
        provinceName: '경기도',
        cityName: '고양시',
        districtName: '일산동구',
        connectedSources: [],
        rankState: { tier: '러너', lp: 120 },
      },
    ],
    runs: [
      { id: 'duel-run', userId: 'opponent-user', date: '2026-05-01', distanceKm: 5, pace: '06:00/km', matchResult: { mode: 'duel' } },
      { id: 'group-run', userId: 'opponent-user', date: '2026-05-02', distanceKm: 3, pace: '07:00/km', matchResult: { mode: 'group' } },
      { id: 'solo-run', userId: 'opponent-user', date: '2026-05-03', distanceKm: 2, pace: '08:00/km' },
      { id: 'viewer-run', userId: 'viewer', date: '2026-05-04', distanceKm: 1, pace: '09:00/km', matchResult: { mode: 'duel' } },
    ],
  };

  await createRouteRequest({
    loadStore: () => store,
    requireUser: () => store.users[0],
  })(
    { method: 'GET', url: '/api/users/opponent-user/match-profile', headers: { host: 'localhost' } },
    response,
  );

  const payload = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.id, 'opponent-user');
  assert.equal(payload.name, '상대 러너');
  assert.equal(payload.publicTag, 'oppo');
  assert.equal(payload.provinceName, '경기도');
  assert.equal(payload.cityName, '고양시');
  assert.equal(payload.districtName, '일산동구');
  assert.deepEqual(payload.rankState, { tier: '러너', lp: 120 });
  assert.equal(payload.lifetimeDistanceKm, 10);
  assert.deepEqual(payload.matchRecord, { total: 2, duel: 1, group: 1 });
  assert.equal(payload.realName, undefined);
  assert.equal(payload.phoneNumber, undefined);
  assert.equal(payload.passwordHash, undefined);
});

await test('requires authentication for opponent match profile', async () => {
  await assert.rejects(
    () => createRouteRequest({
      loadStore: () => ({ users: [], runs: [] }),
      requireUser: () => {
        throw new TestApiError(401, '로그인이 필요해.');
      },
    })(
      { method: 'GET', url: '/api/users/opponent-user/match-profile', headers: { host: 'localhost' } },
      createMockResponse(),
    ),
    (error) => error instanceof TestApiError
      && error.statusCode === 401
      && error.message === '로그인이 필요해.',
  );
});

await test('returns 404 for missing opponent match profile user', async () => {
  await assert.rejects(
    () => createRouteRequest({
      loadStore: () => ({
        users: [{ id: 'viewer', name: '조회자', publicTag: 'viewer', districtName: '일산서구', connectedSources: [] }],
        runs: [],
      }),
      requireUser: () => ({ id: 'viewer' }),
    })(
      { method: 'GET', url: '/api/users/missing-user/match-profile', headers: { host: 'localhost' } },
      createMockResponse(),
    ),
    (error) => error.statusCode === 404 && error.message === '사용자를 찾을 수 없어.',
  );
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
