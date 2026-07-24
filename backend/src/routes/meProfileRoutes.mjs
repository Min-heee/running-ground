import { ApiError } from '../response/httpResponse.mjs';
import {
  isAppleRevocationConfigured,
  revokeAppleRefreshToken,
} from '../lib/appleTokenRevocation.mjs';

export async function routeMeProfileRequest({
  method,
  pathname,
  request,
  response,
  sendJson,
  mutateStore,
  getAuthRepository,
  getAccessToken,
  buildProfileReadPayload,
  buildProfile,
  requireUser,
  resolveRegionSelection,
  validateRequiredString,
  parseJsonBody,
  loadStore,
  url,
}) {
  if (pathname === '/api/me/profile' && method === 'GET') {
    sendJson(response, 200, await buildProfileReadPayload(request));
    return true;
  }

  if (pathname === '/api/me/tag-availability' && method === 'GET') {
    await handleCheckMyTagAvailability({
      loadStore,
      request,
      requireUser,
      response,
      sendJson,
      url,
    });
    return true;
  }

  if (pathname === '/api/me/account' && method === 'DELETE') {
    await handleDeleteMyAccount({
      getAccessToken,
      getAuthRepository,
      request,
      response,
      sendJson,
    });
    return true;
  }

  if (pathname === '/api/me/profile' && method === 'PATCH') {
    await handlePatchMyProfile({
      buildProfile,
      mutateStore,
      parseJsonBody,
      request,
      requireUser,
      response,
      sendJson,
      validateRequiredString,
    });
    return true;
  }

  if (pathname === '/api/me/region' && method === 'PATCH') {
    await handlePatchMyRegion({
      buildProfile,
      mutateStore,
      parseJsonBody,
      request,
      requireUser,
      resolveRegionSelection,
      response,
      sendJson,
    });
    return true;
  }

  return false;
}

async function handleDeleteMyAccount({
  getAccessToken,
  getAuthRepository,
  request,
  response,
  sendJson,
}) {
  const { appleRefreshToken, ...payload } = await getAuthRepository().deleteAccount({
    token: getAccessToken(request),
  });

  sendJson(response, 200, payload);

  // 애플 로그인 계정 탈퇴 시 토큰 철회 (가이드라인 5.1.1). 응답 후
  // fire-and-forget — 애플이 느려도 탈퇴 응답이 막히지 않고, 철회 실패는
  // 로그만 남긴다. refreshToken은 응답에 절대 싣지 않는다.
  if (appleRefreshToken && isAppleRevocationConfigured()) {
    void revokeAppleRefreshToken(appleRefreshToken).catch((error) => {
      console.error(
        `[runningground-backend] 탈퇴 애플 토큰 철회 실패 (탈퇴는 완료됨): ${error?.message ?? error}`,
      );
    });
  }
}

// 태그는 '#' + 대문자 영숫자 코드. 클라는 코드만 편집하고('#' 고정 프리픽스),
// 서버는 '#' 유무를 모두 받아 정규화한다. 3~8자 — 기존 발급 태그는 5자.
const PUBLIC_TAG_CODE_PATTERN = /^[A-Z0-9]{3,8}$/;

// 태그 실시간 중복확인 — 저장(PATCH)의 409와 같은 규칙을 읽기 전용으로 미리
// 보여준다. 형식 오류도 200 + available:false로 내려 클라가 인디케이터 하나로
// 처리한다 (저장 시 409가 최종 권위인 건 변함없음).
async function handleCheckMyTagAvailability({
  loadStore,
  request,
  requireUser,
  response,
  sendJson,
  url,
}) {
  const store = await loadStore();
  const user = requireUser(store, request);
  const code = String(url.searchParams.get('code') ?? '').trim().replace(/^#/, '').toUpperCase();

  if (!PUBLIC_TAG_CODE_PATTERN.test(code)) {
    sendJson(response, 200, {
      available: false,
      reason: 'format',
      message: '태그는 영문/숫자 3~8자로 입력해주세요.',
    });
    return;
  }

  const nextTag = `#${code}`;

  if (nextTag === user.publicTag) {
    sendJson(response, 200, {
      available: true,
      reason: 'own',
      message: '지금 쓰고 있는 태그예요.',
    });
    return;
  }

  if (store.users.some((entry) => entry.id !== user.id && entry.publicTag === nextTag)) {
    sendJson(response, 200, {
      available: false,
      reason: 'taken',
      message: '이미 사용 중인 태그예요.',
    });
    return;
  }

  sendJson(response, 200, {
    available: true,
    reason: 'free',
    message: '사용할 수 있는 태그예요.',
  });
}
const STATUS_MESSAGE_MAX_LENGTH = 40;

function resolveNextPublicTag(store, user, rawValue) {
  const code = String(rawValue ?? '').trim().replace(/^#/, '').toUpperCase();

  if (!PUBLIC_TAG_CODE_PATTERN.test(code)) {
    throw new ApiError(400, '태그는 영문/숫자 3~8자로 입력해주세요.');
  }

  const nextTag = `#${code}`;

  if (store.users.some((entry) => entry.id !== user.id && entry.publicTag === nextTag)) {
    throw new ApiError(409, '이미 사용 중인 태그예요.');
  }

  return nextTag;
}

function validateStatusMessage(rawValue) {
  const message = String(rawValue ?? '').trim();

  if (message.length > STATUS_MESSAGE_MAX_LENGTH) {
    throw new ApiError(400, `상태 메시지는 ${STATUS_MESSAGE_MAX_LENGTH}자 이하로 입력해주세요.`);
  }

  return message;
}

async function handlePatchMyProfile({
  buildProfile,
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  validateRequiredString,
}) {
  const body = await parseJsonBody(request);

  const payload = await mutateStore((store) => {
    const user = requireUser(store, request);
    user.name = validateRequiredString(body.name, '닉네임을 입력해주세요.');

    if (body.publicTag !== undefined) {
      const nextTag = resolveNextPublicTag(store, user, body.publicTag);

      if (nextTag !== user.publicTag) {
        // Offline race registrations reference users BY TAG — carry them over
        // so a rename doesn't orphan an existing 신청.
        for (const event of store.offlineRaceEvents ?? []) {
          if (Array.isArray(event?.registeredUserTags)) {
            event.registeredUserTags = event.registeredUserTags.map((tag) => (
              tag === user.publicTag ? nextTag : tag
            ));
          }
        }

        user.publicTag = nextTag;
      }
    }

    if (body.statusMessage !== undefined) {
      user.statusMessage = validateStatusMessage(body.statusMessage);
    }

    return buildProfile(store, user);
  });

  sendJson(response, 200, payload);
}

async function handlePatchMyRegion({
  buildProfile,
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  resolveRegionSelection,
  response,
  sendJson,
}) {
  const body = await parseJsonBody(request);

  const payload = await mutateStore((store) => {
    const user = requireUser(store, request);
    const region = resolveRegionSelection(body.provinceName, body.cityName, body.districtName);
    user.provinceName = region.provinceName;
    user.cityName = region.cityName;
    user.districtName = region.districtName;
    return buildProfile(store, user);
  });

  sendJson(response, 200, payload);
}
