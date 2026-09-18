import assert from 'node:assert/strict';

import { createApiRouteHandler } from './index.mjs';
import { createCrewRateLimiters } from './crewRoutes.mjs';
import { ApiError } from '../response/httpResponse.mjs';
import { validateRequiredString } from '../lib/validators.mjs';
import { createRateLimiter } from '../lib/rateLimiter.mjs';
import {
  createCrew,
  joinCrewByCode,
  kickCrewMember,
  leaveCrew,
  rotateCrewInviteCode,
  transferCrewCaptain,
} from '../lib/crew/crewMembership.mjs';
import {
  cancelCrewJoinRequest,
  decideCrewJoinRequest,
  requestToJoinCrew,
} from '../lib/crew/crewRequests.mjs';
import { hasUnsealedCrewSeason, sweepCrewSeasons } from '../lib/crew/crewSeason.mjs';
import {
  buildCrewDetailPayload,
  buildCrewHomePayload,
  buildCrewLeaguePayload,
  buildCrewPreviewPayload,
  buildCrewRequestsPayload,
  buildCrewSearchPayload,
} from '../lib/crew/crewPayloads.mjs';

// 크루대전 라우트: 실제 크루 도메인 함수를 주입해 응답 모양이 클라이언트 계약
// (src/lib/api/types/crew.ts)과 필드 단위로 같은지 고정한다 (2026-09-18).

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// 실물 저장소처럼: mutator가 던지면 아무것도 커밋되지 않는다.
function createStoreHarness(initialStore) {
  let committed = clone(initialStore);
  const calls = { load: 0, mutate: 0 };
  return {
    calls,
    loadStore: async () => {
      calls.load += 1;
      return clone(committed);
    },
    mutateStore: async (mutator) => {
      calls.mutate += 1;
      const next = clone(committed);
      const result = mutator(next);
      committed = next;
      return result;
    },
    peek: () => committed,
    replace: (updater) => {
      updater(committed);
    },
  };
}

function createMockResponse() {
  return {
    body: undefined,
    headers: undefined,
    statusCode: undefined,
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
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

function requireUser(store, request) {
  const token = String(request.headers.authorization ?? '').replace(/^Bearer /, '');
  const session = (store.sessions ?? []).find((entry) => entry.token === token);
  const user = session ? store.users.find((entry) => entry.id === session.userId) : null;
  if (!user) {
    throw new ApiError(401, '로그인이 필요해요.');
  }
  return user;
}

const CREW_DEPENDENCIES = {
  buildCrewDetailPayload,
  buildCrewHomePayload,
  buildCrewLeaguePayload,
  buildCrewPreviewPayload,
  buildCrewRequestsPayload,
  buildCrewSearchPayload,
  cancelCrewJoinRequest,
  createCrew,
  decideCrewJoinRequest,
  hasUnsealedCrewSeason,
  joinCrewByCode,
  kickCrewMember,
  leaveCrew,
  requestToJoinCrew,
  rotateCrewInviteCode,
  sweepCrewSeasons,
  transferCrewCaptain,
};

function buildInitialStore() {
  return {
    users: ['u1', 'u2', 'u3', 'u4'].map((id, index) => ({ id, name: `러너${index + 1}` })),
    sessions: ['u1', 'u2', 'u3', 'u4'].map((id) => ({ token: `t-${id}`, userId: id })),
    runs: [],
    notifications: [],
  };
}

function createHandler(harness, overrides = {}) {
  const route = createApiRouteHandler({
    ApiError,
    sendJson,
    loadStore: harness.loadStore,
    mutateStore: harness.mutateStore,
    parseJsonBody: async (request) => request.body ?? {},
    requireUser,
    requireAdmin: (request) => {
      if (request.headers['x-admin-token'] !== 'admin') {
        throw new ApiError(401, '관리자 토큰이 올바르지 않아요.');
      }
    },
    validateRequiredString,
    crewRateLimiters: createCrewRateLimiters(),
    ...CREW_DEPENDENCIES,
    ...overrides,
  });

  return async (method, url, { userId = 'u1', body, headers = {} } = {}) => {
    const response = createMockResponse();
    await route(
      { method, url, body, headers: { host: 'localhost', authorization: `Bearer t-${userId}`, ...headers } },
      response,
    );
    const isJson = String(response.headers?.['Content-Type'] ?? '').includes('application/json');
    return { statusCode: response.statusCode, body: isJson ? JSON.parse(response.body) : response.body };
  };
}

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`[crewRoutes] ok - ${name}`);
  } catch (error) {
    console.error(`[crewRoutes] failed - ${name}`);
    throw error;
  }
}

const sortedKeys = (value) => Object.keys(value).sort();
const SEASON_KEYS = ['daysLeft', 'endsAt', 'firstStarSeasonKey', 'isFirstSeason', 'isPreseason', 'label', 'priorKm', 'sealsAt', 'seasonKey', 'startsAt', 'status'];
const SUMMARY_KEYS = ['captainName', 'id', 'memberCount', 'name', 'stars'];
const STANDING_KEYS = ['crewId', 'isMine', 'name', 'rank', 'runnerCount', 'score', 'seasonMemberCount', 'stars', 'totalKm', 'unrankedReason'];
const MEMBER_KEYS = ['contributionKm', 'countedFrom', 'countsFrom', 'isMe', 'name', 'role', 'userId'];

async function expectCrewError(promise, statusCode, code) {
  await assert.rejects(promise, (error) => error instanceof ApiError
    && error.statusCode === statusCode
    && error.details?.code === code);
}

await runTest('home/create/join/preview/search/detail/league 응답이 계약 모양과 정확히 같다', async () => {
  const harness = createStoreHarness(buildInitialStore());
  const call = createHandler(harness);

  const empty = await call('GET', '/api/crews/home');
  assert.equal(empty.statusCode, 200);
  assert.deepEqual(sortedKeys(empty.body), ['joinsLeftThisMonth', 'lastSeason', 'myCrew', 'myPendingRequest', 'rankedCrewCount', 'season', 'top']);
  assert.deepEqual(sortedKeys(empty.body.season), SEASON_KEYS);
  assert.equal(empty.body.myCrew, null);
  assert.equal(empty.body.myPendingRequest, null);
  assert.equal(empty.body.joinsLeftThisMonth, 3);

  const created = await call('POST', '/api/crews', { body: { name: '새벽 러너스' } });
  const myCrew = created.body.myCrew;
  assert.deepEqual(sortedKeys(myCrew), ['crew', 'inviteCode', 'members', 'pendingRequestCount', 'role', 'standing']);
  assert.deepEqual(sortedKeys(myCrew.crew), SUMMARY_KEYS);
  assert.deepEqual(sortedKeys(myCrew.standing), STANDING_KEYS);
  assert.deepEqual(sortedKeys(myCrew.members[0]), MEMBER_KEYS);
  assert.equal(myCrew.role, 'captain');
  assert.equal(myCrew.crew.captainName, '러너1');
  assert.equal(myCrew.standing.isMine, true);
  assert.equal(myCrew.members[0].isMe, true);
  assert.equal(created.body.joinsLeftThisMonth, 2);

  const code = myCrew.inviteCode;
  const preview = await call('GET', `/api/crews/preview?code=${code.toLowerCase()}`, { userId: 'u2' });
  assert.deepEqual(sortedKeys(preview.body), ['crew', 'standing']);
  assert.equal(preview.body.standing.isMine, false);

  const joined = await call('POST', '/api/crews/join', { userId: 'u2', body: { code } });
  assert.equal(joined.body.myCrew.role, 'member');
  assert.equal(joined.body.myCrew.crew.memberCount, 2);
  assert.equal(joined.body.myCrew.pendingRequestCount, 0);

  const search = await call('GET', '/api/crews/search?q=%EC%83%88%EB%B2%BD%EB%9F%AC', { userId: 'u3' });
  assert.deepEqual(search.body.crews.map((entry) => entry.name), ['새벽 러너스']);
  assert.deepEqual(sortedKeys(search.body.crews[0]), [...SUMMARY_KEYS, 'rank'].sort());

  const detail = await call('GET', `/api/crews/detail?crewId=${myCrew.crew.id}`, { userId: 'u3' });
  assert.deepEqual(sortedKeys(detail.body), ['canRequest', 'crew', 'members', 'myRequestPending', 'standing']);
  assert.equal(detail.body.canRequest, true);

  const league = await call('GET', '/api/crews/league');
  assert.deepEqual(sortedKeys(league.body), ['ranked', 'sealed', 'season', 'unranked']);
  assert.equal(league.body.sealed, false);
  assert.equal(league.body.unranked[0].unrankedReason, 'too_few_members');
});

await runTest('도메인 오류는 code를 싣고, 실패한 변경은 커밋되지 않는다', async () => {
  const harness = createStoreHarness(buildInitialStore());
  const call = createHandler(harness);

  await expectCrewError(call('POST', '/api/crews/join', { body: { code: 'ZZZZZZ' } }), 404, 'not_found');
  await expectCrewError(call('POST', '/api/crews', { body: { name: '공식 크루' } }), 400, 'blocked_name');
  assert.equal(harness.peek().crews ?? undefined, undefined);

  await call('POST', '/api/crews', { body: { name: '새벽' } });
  await expectCrewError(call('POST', '/api/crews', { userId: 'u2', body: { name: '새 벽' } }), 409, 'name_taken');
  await expectCrewError(call('GET', '/api/crews/league?season=2020-01'), 404, 'not_found');
  await assert.rejects(
    call('GET', '/api/crews/unknown'),
    (error) => error.statusCode === 404 && error.message === '요청한 API를 찾을 수 없어요.',
  );
});

await runTest('미리보기·가입·신청(+취소)·검색·코드 재발급은 사용자당 레이트 리밋(429 rate_limited)', async () => {
  const harness = createStoreHarness(buildInitialStore());
  const tight = { windowMs: 60_000, max: 1 };
  const call = createHandler(harness, {
    crewRateLimiters: {
      preview: createRateLimiter(tight),
      join: createRateLimiter(tight),
      request: createRateLimiter(tight),
      search: createRateLimiter(tight),
      rotate: createRateLimiter(tight),
    },
  });

  await expectCrewError(call('GET', '/api/crews/preview?code=ABCDEF'), 404, 'not_found');
  await expectCrewError(call('GET', '/api/crews/preview?code=ABCDEF'), 429, 'rate_limited');
  // 다른 사용자는 따로 센다.
  await expectCrewError(call('GET', '/api/crews/preview?code=ABCDEF', { userId: 'u2' }), 404, 'not_found');

  await call('GET', '/api/crews/search?q=');
  await expectCrewError(call('GET', '/api/crews/search?q='), 429, 'rate_limited');

  // 신청 취소는 신청과 한 통을 나눠 쓴다 — 신청·취소 반복으로 캡틴 알림을 퍼붓지 못한다.
  const created = await call('POST', '/api/crews', { body: { name: '새벽' } });
  const crewId = created.body.myCrew.crew.id;
  const requested = await call('POST', '/api/crews/requests', { userId: 'u2', body: { crewId } });
  await expectCrewError(
    call('POST', '/api/crews/requests/cancel', { userId: 'u2', body: { requestId: requested.body.myPendingRequest.requestId } }),
    429,
    'rate_limited',
  );

  await call('POST', '/api/crews/rotate-code', { body: { crewId } });
  await expectCrewError(call('POST', '/api/crews/rotate-code', { body: { crewId } }), 429, 'rate_limited');
});

await runTest('신청 → 캡틴 목록 → 승인은 CrewRequestsResponse · 이미 다른 크루면 void를 커밋하고 already_in_crew', async () => {
  const harness = createStoreHarness(buildInitialStore());
  const call = createHandler(harness);
  const created = await call('POST', '/api/crews', { body: { name: '새벽' } });
  const crewId = created.body.myCrew.crew.id;
  await call('POST', '/api/crews', { userId: 'u4', body: { name: '노을' } });

  const requested = await call('POST', '/api/crews/requests', { userId: 'u2', body: { crewId } });
  assert.equal(requested.body.myPendingRequest.crewId, crewId);
  const requested3 = await call('POST', '/api/crews/requests', { userId: 'u3', body: { crewId } });

  const listed = await call('GET', `/api/crews/requests?crewId=${crewId}`);
  assert.deepEqual(sortedKeys(listed.body), ['requests']);
  assert.deepEqual(sortedKeys(listed.body.requests[0]), ['createdAt', 'name', 'requestId', 'userId']);
  await expectCrewError(call('GET', `/api/crews/requests?crewId=${crewId}`, { userId: 'u2' }), 403, 'not_captain');

  await assert.rejects(
    call('POST', '/api/crews/requests/decide', { body: { requestId: listed.body.requests[0].requestId, approve: 'yes' } }),
    (error) => error.statusCode === 400,
  );
  const approved = await call('POST', '/api/crews/requests/decide', {
    body: { requestId: listed.body.requests[0].requestId, approve: true },
  });
  assert.deepEqual(approved.body.requests.map((entry) => entry.userId), ['u3']);

  // u3이 신청을 둔 채로 다른 크루 멤버십이 생긴 경합 상태.
  const noulId = harness.peek().crews.find((crew) => crew.name === '노을').id;
  harness.replace((store) => {
    store.crewMembers.push({
      id: 'race-row', crewId: noulId, userId: 'u3', role: 'member',
      joinedAt: new Date().toISOString(), countsFrom: new Date().toISOString(), leftAt: null, leftReason: null,
    });
  });
  await expectCrewError(
    call('POST', '/api/crews/requests/decide', { body: { requestId: requested3.body.myPendingRequest.requestId, approve: true } }),
    409,
    'already_in_crew',
  );
  const voided = harness.peek().crewJoinRequests.find((entry) => entry.id === requested3.body.myPendingRequest.requestId);
  assert.equal(voided.status, 'void');
});

await runTest('나가기·내보내기·캡틴·코드 재발급·신청 취소는 홈 페이로드를 돌려준다', async () => {
  const harness = createStoreHarness(buildInitialStore());
  const call = createHandler(harness);
  const created = await call('POST', '/api/crews', { body: { name: '새벽' } });
  const { id: crewId } = created.body.myCrew.crew;
  const oldCode = created.body.myCrew.inviteCode;
  await call('POST', '/api/crews/join', { userId: 'u2', body: { code: oldCode } });
  await call('POST', '/api/crews/join', { userId: 'u3', body: { code: oldCode } });

  const rotated = await call('POST', '/api/crews/rotate-code', { body: { crewId } });
  assert.notEqual(rotated.body.myCrew.inviteCode, oldCode);

  const kicked = await call('POST', '/api/crews/kick', { body: { crewId, userId: 'u3' } });
  assert.equal(kicked.body.myCrew.crew.memberCount, 2);

  const handed = await call('POST', '/api/crews/captain', { body: { crewId, userId: 'u2' } });
  assert.equal(handed.body.myCrew.role, 'member');
  assert.equal(handed.body.myCrew.crew.captainName, '러너2');

  const left = await call('POST', '/api/crews/leave', { body: { crewId } });
  assert.equal(left.body.myCrew, null);
  await expectCrewError(call('POST', '/api/crews/leave', { body: { crewId } }), 403, 'not_member');

  const requested = await call('POST', '/api/crews/requests', { userId: 'u4', body: { crewId } });
  const cancelled = await call('POST', '/api/crews/requests/cancel', {
    userId: 'u4',
    body: { requestId: requested.body.myPendingRequest.requestId },
  });
  assert.equal(cancelled.body.myPendingRequest, null);
});

await runTest('home/league는 유예가 지난 미봉인 시즌이 보이면 먼저 봉인하고 다시 읽는다', async () => {
  const harness = createStoreHarness(buildInitialStore());
  let unsealed = true;
  const sweeps = [];
  const call = createHandler(harness, {
    hasUnsealedCrewSeason: () => unsealed,
    sweepCrewSeasons: (store, now) => {
      sweeps.push(now);
      store.crewSeasonAwards = [];
      unsealed = false;
    },
  });

  const response = await call('GET', '/api/crews/home');
  assert.equal(response.statusCode, 200);
  assert.equal(sweeps.length, 1);
  assert.equal(harness.calls.mutate, 1);
  assert.equal(harness.calls.load, 2);

  await call('GET', '/api/crews/league');
  assert.equal(sweeps.length, 1);
});

await runTest('운영자: 크루 이름 변경·종료 (관리자 토큰 필요)', async () => {
  const harness = createStoreHarness(buildInitialStore());
  const call = createHandler(harness);
  const created = await call('POST', '/api/crews', { body: { name: '새벽' } });
  const crewId = created.body.myCrew.crew.id;
  const admin = { headers: { 'x-admin-token': 'admin' } };

  await assert.rejects(call('POST', '/api/admin/crews/rename', { body: { crewId, name: '바뀜' } }), (error) => error.statusCode === 401);
  const renamed = await call('POST', '/api/admin/crews/rename', { ...admin, body: { crewId, name: '바뀐 이름' } });
  assert.deepEqual(renamed.body, { success: true, crew: { id: crewId, name: '바뀐 이름' } });

  const closed = await call('POST', '/api/admin/crews/close', { ...admin, body: { crewId } });
  assert.equal(closed.body.success, true);
  assert.equal(typeof closed.body.crew.closedAt, 'string');
  const home = await call('GET', '/api/crews/home');
  assert.equal(home.body.myCrew, null);
});

await runTest('다운로드 링크 ?crew=CODE는 크루 가입 랜딩, 형식이 틀린 코드는 일반 랜딩', async () => {
  const harness = createStoreHarness(buildInitialStore());
  const call = createHandler(harness);
  const android = { 'user-agent': 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 Chrome/124.0 Mobile' };

  const landing = await call('GET', '/download?crew=abc23k', { headers: android });
  assert.equal(landing.statusCode, 200);
  assert.ok(landing.body.includes('runningground://crew-join?code=ABC23K'));
  assert.ok(landing.body.includes('크루 초대 코드'));

  // I/O/0/1이 섞였거나 스크립트 주입 시도 → 크루 랜딩이 아니다.
  for (const bad of ['ABC10K', '%3Cscript%3E', 'ABCDEFG']) {
    const fallback = await call('GET', `/download?crew=${bad}`, { headers: android });
    assert.equal(fallback.statusCode, 200);
    assert.ok(!fallback.body.includes('crew-join'));
    assert.ok(fallback.body.includes('Google Play에서 받기'));
  }
});
