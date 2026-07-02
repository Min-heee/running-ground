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
      parseJsonBody,
      request,
      response,
      sendJson,
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
  parseJsonBody,
  request,
  response,
  sendJson,
  validateRequiredString,
}) {
  const body = await parseJsonBody(request);
  const realName = validateRequiredString(body.realName, '이름을 입력해주세요.');
  const phone = validateRequiredString(body.phone, '휴대폰 번호를 입력해주세요.').replace(/\D/g, '');
  const birthDate = validateRequiredString(body.birthDate, '생년월일을 입력해주세요.');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new ApiError(400, '생년월일은 YYYY-MM-DD 형식으로 입력해주세요.');
  }

  if (phone.length < 10) {
    throw new ApiError(400, '휴대폰 번호를 정확히 입력해주세요.');
  }

  const result = await getAuthRepository().findUsername({
    realName,
    phone,
    birthDate,
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
  const birthDate = validateRequiredString(body.birthDate, '생년월일을 입력해주세요.');
  const newPassword = validateNewPassword(body.newPassword);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new ApiError(400, '생년월일은 YYYY-MM-DD 형식으로 입력해주세요.');
  }

  if (phone.length < 10) {
    throw new ApiError(400, '휴대폰 번호를 정확히 입력해주세요.');
  }

  const result = await getAuthRepository().resetPassword({
    username,
    realName,
    phone,
    birthDate,
    newPassword,
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
