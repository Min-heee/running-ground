import {
  LOGIN_PER_ACCOUNT_PER_HOUR,
  LOGIN_PER_IP_PER_MINUTE,
  TRUST_PROXY,
} from '../config.mjs';
import { createLoginGuard, resolveClientIp } from '../lib/rateLimiter.mjs';

// 로그인 브루트포스 방지: IP당 분당 + 계정당 시간당 한도.
// 프로세스 수명 동안 공유하고, 테스트에서는 routeContext로 교체 주입한다.
const defaultLoginGuard = createLoginGuard({
  perIpPerMinute: LOGIN_PER_IP_PER_MINUTE,
  perAccountPerHour: LOGIN_PER_ACCOUNT_PER_HOUR,
});

export async function routeAuthLoginRequest({
  method,
  pathname,
  request,
  response,
  url,
  sendJson,
  getAuthRepository,
  getAccessToken,
  loginGuard = defaultLoginGuard,
  trustProxy = TRUST_PROXY,
  validateNewPassword,
  validateRequiredString,
  validateUsername,
  parseJsonBody,
  ApiError,
}) {
  if (pathname === '/api/auth/login' && method === 'POST') {
    await handleLogin({
      ApiError,
      getAuthRepository,
      loginGuard,
      parseJsonBody,
      request,
      response,
      sendJson,
      trustProxy,
      validateRequiredString,
    });
    return true;
  }

  if (pathname === '/api/auth/find-username' && method === 'POST') {
    await handleFindUsername({
      ApiError,
      getAuthRepository,
      loginGuard,
      parseJsonBody,
      request,
      response,
      sendJson,
      trustProxy,
      validateRequiredString,
    });
    return true;
  }

  if (pathname === '/api/auth/reset-password' && method === 'POST') {
    await handleResetPassword({
      ApiError,
      getAuthRepository,
      loginGuard,
      parseJsonBody,
      request,
      response,
      sendJson,
      trustProxy,
      validateNewPassword,
      validateRequiredString,
      validateUsername,
    });
    return true;
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    await handleLogout({
      getAccessToken,
      getAuthRepository,
      request,
      response,
      sendJson,
    });
    return true;
  }

  if (pathname === '/api/auth/check-username' && method === 'GET') {
    const username = validateUsername(url.searchParams.get('username') ?? '');
    sendJson(response, 200, await getAuthRepository().checkUsername(username));
    return true;
  }

  return false;
}

async function handleLogin({
  ApiError,
  getAuthRepository,
  loginGuard,
  parseJsonBody,
  request,
  response,
  sendJson,
  trustProxy,
  validateRequiredString,
}) {
  const body = await parseJsonBody(request);
  const username = validateRequiredString(body.username, '아이디를 입력해주세요.').toLowerCase();
  const password = validateRequiredString(body.password, '비밀번호를 입력해주세요.');

  assertLoginRateLimit({ ApiError, loginGuard, request, trustProxy, username });

  const result = await getAuthRepository().login({ username, password });

  sendJson(response, 200, result);
}

function assertLoginRateLimit({ ApiError, loginGuard, request, trustProxy, username }) {
  const clientIp = resolveClientIp(request, { trustProxy });
  const decision = loginGuard.check({ ip: clientIp, username });

  if (!decision.allowed) {
    throw new ApiError(429, '로그인 시도가 너무 많아요. 잠시 후 다시 시도해주세요.', {
      retryAfterSeconds: decision.retryAfterSeconds,
    });
  }
}

async function handleFindUsername({
  ApiError,
  getAuthRepository,
  loginGuard,
  parseJsonBody,
  request,
  response,
  sendJson,
  trustProxy,
  validateRequiredString,
}) {
  const body = await parseJsonBody(request);
  const realName = validateRequiredString(body.realName, '이름을 입력해주세요.');
  const phone = validateRequiredString(body.phone, '휴대폰 번호를 입력해주세요.').replace(/\D/g, '');
  // Apple 5.1.1(v): find-username no longer keys on 생년월일. Instead it requires a verified
  // 'find_username' phone-OTP token (same mechanism reset-password uses) — proving phone
  // ownership is a strictly stronger identity factor than a knowable birth date.
  const phoneVerificationToken = validateRequiredString(
    body.phoneVerificationToken,
    '휴대폰 인증을 먼저 완료해주세요.',
  );

  if (phone.length < 10) {
    throw new ApiError(400, '휴대폰 번호를 정확히 입력해주세요.');
  }

  // P1-1: find-username shares the login brute-force guard so it can't be scraped; the account
  // here is unknown, so key the per-account bucket by the normalized phone number.
  assertLoginRateLimit({ ApiError, loginGuard, request, trustProxy, username: phone });

  const result = await getAuthRepository().findUsername({
    realName,
    phone,
    phoneVerificationToken,
  });

  sendJson(response, 200, result);
}

async function handleResetPassword({
  ApiError,
  getAuthRepository,
  loginGuard,
  parseJsonBody,
  request,
  response,
  sendJson,
  trustProxy,
  validateNewPassword,
  validateRequiredString,
  validateUsername,
}) {
  const body = await parseJsonBody(request);
  const username = validateUsername(body.username);

  // 비밀번호 재설정도 로그인과 같은 브루트포스 표면이라 동일 한도를 공유한다.
  // (재설정 플로우 자체 로직은 별도 작업에서 다룬다 — 여기서는 한도만.)
  assertLoginRateLimit({ ApiError, loginGuard, request, trustProxy, username });

  const realName = validateRequiredString(body.realName, '이름을 입력해주세요.');
  const phone = validateRequiredString(body.phone, '휴대폰 번호를 입력해주세요.').replace(/\D/g, '');
  const newPassword = validateNewPassword(body.newPassword);
  // P0-1: reset requires a verified 'reset' phone challenge token (from POST
  // /auth/phone/verify-code). Apple 5.1.1(v): 생년월일 is no longer collected/required — the
  // OTP token already gates the reset, so identity is username+realName+phone+verified OTP.
  const phoneVerificationToken = validateRequiredString(body.phoneVerificationToken, '휴대폰 인증을 먼저 완료해주세요.');

  if (phone.length < 10) {
    throw new ApiError(400, '휴대폰 번호를 정확히 입력해주세요.');
  }

  const result = await getAuthRepository().resetPassword({
    username,
    realName,
    phone,
    newPassword,
    phoneVerificationToken,
  });

  sendJson(response, 200, result);
}

async function handleLogout({
  getAccessToken,
  getAuthRepository,
  request,
  response,
  sendJson,
}) {
  const payload = await getAuthRepository().logout({
    token: getAccessToken(request),
  });

  sendJson(response, 200, payload);
}
