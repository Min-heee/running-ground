import assert from 'node:assert/strict';
import { createLoginGuard, createSmsRequestCodeGuard } from '../lib/rateLimiter.mjs';
import { createApiRouteHandler } from './index.mjs';

class TestApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details && typeof details === 'object' ? details : null;
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
        throw new TestApiError(401, '로그인이 필요해요.');
      },
    })(
      { method: 'GET', url: '/api/users/opponent-user/match-profile', headers: { host: 'localhost' } },
      createMockResponse(),
    ),
    (error) => error instanceof TestApiError
      && error.statusCode === 401
      && error.message === '로그인이 필요해요.',
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
    (error) => error.statusCode === 404 && error.message === '사용자를 찾을 수 없어요.',
  );
});

await test('serves authenticated user notifications feed only for the current user', async () => {
  const response = createMockResponse();
  const store = {
    users: [{ id: 'viewer', name: '조회자' }],
    notifications: [
      {
        id: 'old',
        userId: 'viewer',
        type: 'friend_request',
        title: '오래된 알림',
        body: '먼저 온 알림이에요.',
        createdAt: '2026-06-08T00:00:00.000Z',
        readAt: null,
      },
      {
        id: 'latest',
        userId: 'viewer',
        type: 'match_invite',
        title: '새 초대',
        body: '새 파티런 초대예요.',
        data: { roomId: 'room-1' },
        createdAt: '2026-06-08T00:01:00.000Z',
        readAt: null,
      },
      {
        id: 'other-user-item',
        userId: 'other-user',
        type: 'match_invite',
        title: '다른 사용자',
        body: '보이면 안 돼요.',
        createdAt: '2026-06-08T00:02:00.000Z',
        readAt: null,
      },
    ],
  };

  await createRouteRequest({
    loadStore: () => store,
    requireUser: () => store.users[0],
  })(
    { method: 'GET', url: '/api/me/inbox', headers: { host: 'localhost' } },
    response,
  );

  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(payload.unreadCount, 2);
  assert.deepEqual(payload.items.map((item) => item.id), ['latest', 'old']);
  assert.deepEqual(payload.items[0].data, { roomId: 'room-1' });
});

await test('marks selected user notifications as read', async () => {
  const response = createMockResponse();
  const store = {
    users: [{ id: 'viewer', name: '조회자' }],
    notifications: [
      {
        id: 'target',
        userId: 'viewer',
        type: 'friend_request',
        title: '읽을 알림',
        body: '읽음 처리 대상이에요.',
        createdAt: '2026-06-08T00:00:00.000Z',
        readAt: null,
      },
      {
        id: 'keep-unread',
        userId: 'viewer',
        type: 'match_invite',
        title: '남길 알림',
        body: '계속 unread예요.',
        createdAt: '2026-06-08T00:01:00.000Z',
        readAt: null,
      },
    ],
  };

  await createRouteRequest({
    mutateStore: (mutator) => mutator(store),
    parseJsonBody: async () => ({ ids: ['target'] }),
    requireUser: () => store.users[0],
  })(
    { method: 'POST', url: '/api/me/inbox/read', headers: { host: 'localhost' } },
    response,
  );

  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(payload.unreadCount, 1);
  assert.equal(Boolean(store.notifications.find((item) => item.id === 'target').readAt), true);
  assert.equal(store.notifications.find((item) => item.id === 'keep-unread').readAt, null);
});

function createPhoneVerificationRouteDeps({ smsRequestCodeGuard }) {
  const store = { phoneVerificationChallenges: [] };

  return {
    parseJsonBody: async () => ({ purpose: 'register', phone: '01011112222' }),
    validatePhoneVerificationPurpose: (value) => value,
    validatePhoneNumber: (value) => value,
    mutateStore: (mutator) => mutator(store),
    cleanupPhoneVerificationChallenges: () => {},
    ensurePhoneVerificationChallenges: (currentStore) => {
      currentStore.phoneVerificationChallenges = currentStore.phoneVerificationChallenges ?? [];
      return currentStore.phoneVerificationChallenges;
    },
    createPhoneVerificationChallenge: ({ purpose, phone, now }) => ({
      challenge: {
        id: `challenge-${Math.random()}`,
        purpose,
        phone,
        status: 'pending',
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
        resendAvailableAt: new Date(now.getTime()).toISOString(),
      },
      code: '123456',
    }),
    phoneVerificationService: { sendCode: async () => ({ provider: 'mock' }) },
    buildPhoneVerificationPayload: (challenge) => ({ requestId: challenge.id }),
    smsRequestCodeGuard,
  };
}

await test('rate limits phone verification code requests with a Korean 429', async () => {
  const deps = createPhoneVerificationRouteDeps({
    smsRequestCodeGuard: createSmsRequestCodeGuard({
      perIpPerHour: 1,
      uniquePhonesPerIpPerDay: 5,
      perPhonePerDay: 10,
      globalPerDay: 100,
    }),
  });
  const routeRequest = createRouteRequest(deps);
  const request = { method: 'POST', url: '/api/auth/phone/request-code', headers: { host: 'localhost' } };

  const firstResponse = createMockResponse();
  await routeRequest(request, firstResponse);
  assert.equal(firstResponse.statusCode, 200);

  await assert.rejects(
    () => routeRequest(request, createMockResponse()),
    (error) => error instanceof TestApiError
      && error.statusCode === 429
      && error.message === '인증번호 요청이 너무 많아요. 잠시 후 다시 시도해주세요.'
      && error.details.retryAfterSeconds > 0,
  );
});

await test('rate limits distinct phone numbers per IP for verification codes', async () => {
  let requestedPhone = '01000000001';
  const deps = createPhoneVerificationRouteDeps({
    smsRequestCodeGuard: createSmsRequestCodeGuard({
      perIpPerHour: 100,
      uniquePhonesPerIpPerDay: 2,
      perPhonePerDay: 10,
      globalPerDay: 100,
    }),
  });
  deps.parseJsonBody = async () => ({ purpose: 'register', phone: requestedPhone });
  const routeRequest = createRouteRequest(deps);
  const request = { method: 'POST', url: '/api/auth/phone/request-code', headers: { host: 'localhost' } };

  await routeRequest(request, createMockResponse());
  requestedPhone = '01000000002';
  await routeRequest(request, createMockResponse());
  requestedPhone = '01000000003';

  await assert.rejects(
    () => routeRequest(request, createMockResponse()),
    (error) => error instanceof TestApiError && error.statusCode === 429,
  );
});

await test('rate limits login attempts per IP with a Korean 429', async () => {
  const routeRequest = createRouteRequest({
    parseJsonBody: async () => ({ username: 'Runner', password: 'secret' }),
    validateRequiredString: (value) => value,
    getAuthRepository: () => ({ login: async () => ({ token: 'token' }) }),
    loginGuard: createLoginGuard({ perIpPerMinute: 1, perAccountPerHour: 20 }),
  });
  const request = { method: 'POST', url: '/api/auth/login', headers: { host: 'localhost' } };

  const firstResponse = createMockResponse();
  await routeRequest(request, firstResponse);
  assert.equal(firstResponse.statusCode, 200);

  await assert.rejects(
    () => routeRequest(request, createMockResponse()),
    (error) => error instanceof TestApiError
      && error.statusCode === 429
      && error.message === '로그인 시도가 너무 많아요. 잠시 후 다시 시도해주세요.'
      && error.details.retryAfterSeconds > 0,
  );
});

await test('rate limits find-username (an unauthenticated PII oracle) per IP with a Korean 429', async () => {
  // P1-1: find-username shares the login brute-force guard, keyed by the normalized phone.
  const routeRequest = createRouteRequest({
    parseJsonBody: async () => ({ realName: '홍길동', phone: '010-1234-5678', phoneVerificationToken: 'vt-find' }),
    validateRequiredString: (value) => value,
    getAuthRepository: () => ({ findUsername: async () => ({ success: true, username: 'runner', maskedPhone: '010-****-5678' }) }),
    loginGuard: createLoginGuard({ perIpPerMinute: 1, perAccountPerHour: 20 }),
  });
  const request = { method: 'POST', url: '/api/auth/find-username', headers: { host: 'localhost' } };

  const firstResponse = createMockResponse();
  await routeRequest(request, firstResponse);
  assert.equal(firstResponse.statusCode, 200);
  assert.equal(JSON.parse(firstResponse.body).username, 'runner');

  // The very next attempt from the same IP is throttled with the shared 429.
  await assert.rejects(
    () => routeRequest(request, createMockResponse()),
    (error) => error instanceof TestApiError
      && error.statusCode === 429
      && error.message === '로그인 시도가 너무 많아요. 잠시 후 다시 시도해주세요.'
      && error.details.retryAfterSeconds > 0,
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
      && error.message === '요청한 API를 찾을 수 없어요.',
  );
});

// ── 태그 실시간 중복확인 (GET /api/me/tag-availability) ─────────────────────────

await test('tag availability answers free / taken / own / format from one endpoint', async () => {
  const store = {
    sessions: [{ token: 'token', userId: 'me' }],
    users: [
      { id: 'me', name: '나', publicTag: '#MINE1', connectedSources: [] },
      { id: 'other', name: '남', publicTag: '#TAKEN1', connectedSources: [] },
    ],
    runs: [],
  };
  const handler = createRouteRequest({
    loadStore: () => store,
    requireUser: () => store.users[0],
  });
  const ask = async (code) => {
    const response = createMockResponse();
    await handler(
      { method: 'GET', url: `/api/me/tag-availability?code=${encodeURIComponent(code)}`, headers: { host: 'localhost' } },
      response,
    );
    assert.equal(response.statusCode, 200);
    return JSON.parse(response.body);
  };

  // 빈 태그 → 사용 가능.
  assert.deepEqual(await ask('NEW01'), {
    available: true, reason: 'free', message: '사용할 수 있는 태그예요.',
  });
  // 남이 쓰는 태그 → 거절. '#' 접두사/소문자 입력도 정규화되어야 한다.
  assert.equal((await ask('TAKEN1')).reason, 'taken');
  assert.equal((await ask('#taken1')).reason, 'taken');
  // 내 현재 태그 → own (사용 가능으로 취급).
  assert.deepEqual(await ask('MINE1'), {
    available: true, reason: 'own', message: '지금 쓰고 있는 태그예요.',
  });
  // 형식 위반 (2자 / 한글) → format 거절.
  assert.equal((await ask('AB')).reason, 'format');
  assert.equal((await ask('태그')).reason, 'format');
});
