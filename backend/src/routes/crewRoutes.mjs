// 크루대전 API (오너 승인 2026-09-18) — 월간 크루 리그 + 초대 코드 가입 + 공개 크루 신청.
// 변경 요청은 전부 홈 페이로드(CrewHomeResponse)를 돌려준다(그라운드 관례) — 신청 결정만
// 캡틴의 신청 목록(CrewRequestsResponse)을 돌려준다.
//
// 봉인은 크론 없이: home/league 조회가 잠그지 않고 읽은 저장소에서 유예가 지난 미봉인 시즌을
// 보면 mutateStore(sweepCrewSeasons)를 돌리고 다시 읽는다(봉인 함수는 잠금 안에서 seasonKey를
// 다시 확인해 멱등). 아무도 앱을 안 열어도 staleMatchStateSweeper가 5분 주기로 봉인한다.

import { createRateLimiter } from '../lib/rateLimiter.mjs';
import {
  CREW_RATE_LIMIT_MAX,
  CREW_RATE_LIMIT_WINDOW_MS,
  createCrewError,
} from '../lib/crew/crewConstants.mjs';

// 미리보기·코드 가입·가입 신청·검색 — 사용자당 10분에 10회씩(코드 추측 대입·신청 스팸 방지).
// 신청 취소는 신청과 한 통을 나눠 쓴다(적대 리뷰 2026-09-18: 취소만 풀려 있어 신청·취소 반복이
// 캡틴 알림 폭탄이 됐다). 코드 재발급도 묶는다 — 버린 코드는 지우지 않고 쌓이기 때문이다.
// 프로세스 수명 동안 공유하고, 테스트에서는 routeContext로 교체 주입한다.
export function createCrewRateLimiters() {
  const options = { windowMs: CREW_RATE_LIMIT_WINDOW_MS, max: CREW_RATE_LIMIT_MAX };
  return {
    preview: createRateLimiter(options),
    join: createRateLimiter(options),
    request: createRateLimiter(options),
    search: createRateLimiter(options),
    rotate: createRateLimiter(options),
  };
}

const defaultCrewRateLimiters = createCrewRateLimiters();

function assertCrewRateLimit(limiter, userId) {
  const decision = limiter.consume(userId);

  if (!decision.allowed) {
    throw createCrewError('rate_limited', { retryAfterSeconds: decision.retryAfterSeconds });
  }
}

export async function routeCrewRequest({
  method,
  pathname,
  request,
  response,
  url,
  sendJson,
  parseJsonBody,
  loadStore,
  mutateStore,
  requireUser,
  validateRequiredString,
  ApiError,
  crewRateLimiters = defaultCrewRateLimiters,
  hasUnsealedCrewSeason,
  sweepCrewSeasons,
  buildCrewHomePayload,
  buildCrewLeaguePayload,
  buildCrewDetailPayload,
  buildCrewSearchPayload,
  buildCrewPreviewPayload,
  buildCrewRequestsPayload,
  createCrew,
  joinCrewByCode,
  leaveCrew,
  kickCrewMember,
  transferCrewCaptain,
  rotateCrewInviteCode,
  requestToJoinCrew,
  cancelCrewJoinRequest,
  decideCrewJoinRequest,
}) {
  if (pathname !== '/api/crews' && !pathname.startsWith('/api/crews/')) {
    return false;
  }

  // 읽을 때 봉인 — 유예가 지난 미봉인 시즌이 보이면 먼저 봉인하고 다시 읽는다.
  const loadSealedStore = async (now) => {
    let store = await loadStore();
    requireUser(store, request);

    if (hasUnsealedCrewSeason(store, now)) {
      await mutateStore((lockedStore) => {
        sweepCrewSeasons(lockedStore, now);
      });
      store = await loadStore();
    }

    return store;
  };

  const readBody = async () => (await parseJsonBody(request)) ?? {};

  // 변경 요청 공통: 잠금 안에서 사용자 확인 → (레이트 리밋) → 동작 → 홈 페이로드.
  const mutateAndSendHome = async (action, { limiter = null } = {}) => {
    const now = new Date();
    const payload = await mutateStore((store) => {
      const user = requireUser(store, request);
      if (limiter) {
        assertCrewRateLimit(limiter, user.id);
      }
      action(store, user, now);
      return buildCrewHomePayload(store, user, now);
    });
    sendJson(response, 200, payload);
    return true;
  };

  if (pathname === '/api/crews/home' && method === 'GET') {
    const now = new Date();
    const store = await loadSealedStore(now);
    const user = requireUser(store, request);
    sendJson(response, 200, buildCrewHomePayload(store, user, now));
    return true;
  }

  if (pathname === '/api/crews/league' && method === 'GET') {
    const now = new Date();
    const store = await loadSealedStore(now);
    const user = requireUser(store, request);
    sendJson(response, 200, buildCrewLeaguePayload(store, user, url.searchParams.get('season'), now));
    return true;
  }

  if (pathname === '/api/crews/detail' && method === 'GET') {
    const crewId = validateRequiredString(url.searchParams.get('crewId'), '크루를 선택해주세요.');
    const now = new Date();
    const store = await loadStore();
    const user = requireUser(store, request);
    sendJson(response, 200, buildCrewDetailPayload(store, user, crewId, now));
    return true;
  }

  if (pathname === '/api/crews/search' && method === 'GET') {
    const now = new Date();
    const store = await loadStore();
    const user = requireUser(store, request);
    assertCrewRateLimit(crewRateLimiters.search, user.id);
    sendJson(response, 200, buildCrewSearchPayload(store, user, url.searchParams.get('q') ?? '', now));
    return true;
  }

  if (pathname === '/api/crews/preview' && method === 'GET') {
    const now = new Date();
    const store = await loadStore();
    const user = requireUser(store, request);
    assertCrewRateLimit(crewRateLimiters.preview, user.id);
    sendJson(response, 200, buildCrewPreviewPayload(store, user, url.searchParams.get('code') ?? '', now));
    return true;
  }

  if (pathname === '/api/crews' && method === 'POST') {
    const body = await readBody();
    return mutateAndSendHome((store, user, now) => createCrew(store, user, { name: body.name }, now));
  }

  if (pathname === '/api/crews/join' && method === 'POST') {
    const body = await readBody();
    const code = validateRequiredString(body.code, '초대 코드를 입력해주세요.');
    return mutateAndSendHome(
      (store, user, now) => joinCrewByCode(store, user, code, now),
      { limiter: crewRateLimiters.join },
    );
  }

  if (pathname === '/api/crews/requests' && method === 'POST') {
    const body = await readBody();
    const crewId = validateRequiredString(body.crewId, '크루를 선택해주세요.');
    return mutateAndSendHome(
      (store, user, now) => requestToJoinCrew(store, user, crewId, now),
      { limiter: crewRateLimiters.request },
    );
  }

  if (pathname === '/api/crews/requests/cancel' && method === 'POST') {
    const body = await readBody();
    const requestId = validateRequiredString(body.requestId, '신청을 선택해주세요.');
    return mutateAndSendHome(
      (store, user, now) => cancelCrewJoinRequest(store, user, requestId, now),
      { limiter: crewRateLimiters.request },
    );
  }

  if (pathname === '/api/crews/requests' && method === 'GET') {
    const crewId = validateRequiredString(url.searchParams.get('crewId'), '크루를 선택해주세요.');
    const now = new Date();
    const store = await loadStore();
    const user = requireUser(store, request);
    sendJson(response, 200, buildCrewRequestsPayload(store, user, crewId, now));
    return true;
  }

  if (pathname === '/api/crews/requests/decide' && method === 'POST') {
    const body = await readBody();
    const requestId = validateRequiredString(body.requestId, '신청을 선택해주세요.');
    if (typeof body.approve !== 'boolean') {
      throw new ApiError(400, '승인 여부를 선택해주세요.');
    }

    const now = new Date();
    const result = await mutateStore((store) => {
      const user = requireUser(store, request);
      const { request: decided, errorCode } = decideCrewJoinRequest(store, user, requestId, body.approve, now);
      return { errorCode, payload: buildCrewRequestsPayload(store, user, decided.crewId, now) };
    });

    // 'void' 표시는 커밋된 뒤에 오류를 알린다 — mutateStore 안에서 던지면 표시까지 롤백된다.
    if (result.errorCode) {
      throw createCrewError(result.errorCode);
    }

    sendJson(response, 200, result.payload);
    return true;
  }

  if (pathname === '/api/crews/leave' && method === 'POST') {
    const body = await readBody();
    const crewId = validateRequiredString(body.crewId, '크루를 선택해주세요.');
    return mutateAndSendHome((store, user, now) => leaveCrew(store, user, crewId, now));
  }

  if (pathname === '/api/crews/kick' && method === 'POST') {
    const body = await readBody();
    const crewId = validateRequiredString(body.crewId, '크루를 선택해주세요.');
    const targetUserId = validateRequiredString(body.userId, '멤버를 선택해주세요.');
    return mutateAndSendHome((store, user, now) => kickCrewMember(store, user, crewId, targetUserId, now));
  }

  if (pathname === '/api/crews/captain' && method === 'POST') {
    const body = await readBody();
    const crewId = validateRequiredString(body.crewId, '크루를 선택해주세요.');
    const targetUserId = validateRequiredString(body.userId, '멤버를 선택해주세요.');
    return mutateAndSendHome((store, user, now) => transferCrewCaptain(store, user, crewId, targetUserId, now));
  }

  if (pathname === '/api/crews/rotate-code' && method === 'POST') {
    const body = await readBody();
    const crewId = validateRequiredString(body.crewId, '크루를 선택해주세요.');
    return mutateAndSendHome(
      (store, user) => rotateCrewInviteCode(store, user, crewId),
      { limiter: crewRateLimiters.rotate },
    );
  }

  return false;
}
