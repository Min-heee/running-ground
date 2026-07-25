import crypto from 'node:crypto';

import * as backendConfig from '../config.mjs';
import { verifyAppleIdentityToken } from '../lib/appleIdentityToken.mjs';
import {
  exchangeAppleAuthorizationCode,
  isAppleRevocationConfigured,
} from '../lib/appleTokenRevocation.mjs';
import { ApiError } from '../response/httpResponse.mjs';
import {
  buildSocialAuthorizeUrl,
  exchangeSocialAuthCode,
  resolveSocialProviderConfig,
} from '../lib/socialAuthProviders.mjs';

// Browser-redirect social login (Google/Naver/Kakao all require an https callback — custom
// app schemes can't be registered with them):
//   GET /api/auth/<provider>/start    → 302 to the provider's authorize page
//   (provider) → GET /api/auth/<provider>/callback?code&state
//                                      → exchange code, find-or-create user, then 302 back to
//                                        the app's runningground:// scheme carrying the session
//                                        token, which expo-web-browser captures.
const SOCIAL_PATH_PATTERN = /^\/api\/auth\/(google|kakao|naver)\/(start|callback)$/;
const DEFAULT_APP_REDIRECT = 'runningground://oauth';

function encodeState(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeState(state) {
  try {
    const parsed = JSON.parse(Buffer.from(String(state ?? ''), 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// Only allow returning to our own app scheme — never an attacker-supplied URL (open redirect).
function safeAppRedirect(value) {
  return typeof value === 'string' && value.startsWith('runningground://') ? value : DEFAULT_APP_REDIRECT;
}

function appReturnUrl(appRedirect, params) {
  const query = new URLSearchParams(params).toString();
  return `${appRedirect}${appRedirect.includes('?') ? '&' : '?'}${query}`;
}

function redirectTo(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

function callbackUrl(provider) {
  const base = (backendConfig.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  return `${base}/api/auth/${provider}/callback`;
}

export async function routeAuthSocialLoginRequest({
  method,
  pathname,
  url,
  request,
  response,
  sendJson,
  parseJsonBody,
  getAuthRepository,
}) {
  // Sign in with Apple (App Review 4.8): the iOS native sheet returns an
  // identityToken (RS256 JWT). The client POSTs it here, we verify it against
  // Apple's JWKS, and the verified `sub` becomes the social identity — the same
  // findOrCreateSocialUser path the browser providers use, but with a JSON
  // response instead of a redirect (no browser round-trip in the native flow).
  if (pathname === '/api/auth/apple/token' && method === 'POST') {
    const body = await parseJsonBody(request);

    let payload;
    try {
      payload = await verifyAppleIdentityToken(body.identityToken);
    } catch {
      // Never leak which validation step failed to the caller.
      throw new ApiError(401, '애플 로그인 검증에 실패했어요. 다시 시도해주세요.');
    }

    const { accessToken, isNewUser } = await getAuthRepository().findOrCreateSocialUser({
      provider: 'apple',
      providerUserId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : '',
      // Apple surfaces the name only on the FIRST authorization, and only to
      // the client — it rides in the request body.
      name: typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '',
    });

    sendJson(response, 200, { token: accessToken, isNewUser });

    // 운영 진단: 애플 로그인은 드물어 로그 비용이 없고, 철회 토큰이 안 쌓일 때
    // "클라가 코드를 안 보냄(구번들: 필드 없음 / 기기 이상: 길이 0)"과 "서버 미설정"을
    // 로그 한 줄로 가른다. 코드 값 자체는 절대 찍지 않는다.
    console.log(
      `[runningground-backend] 애플 로그인 진단: authorizationCode ${
        body.authorizationCode === undefined ? '필드 없음(구번들)' : `길이 ${String(body.authorizationCode).length}`
      }, 철회설정 ${isAppleRevocationConfigured() ? '활성' : '비활성'}`,
    );

    // 탈퇴 시 토큰 철회(5.1.1)용 refresh token 확보: authorizationCode를 교환해
    // 유저 레코드에 저장한다. 응답을 이미 보낸 뒤의 fire-and-forget — 애플이
    // 느리거나 죽어 있어도 로그인 지연/실패로 이어지지 않는다. 매 로그인마다
    // 갱신되므로 키 설정 이전 가입자도 다음 로그인에 자동으로 채워진다.
    // expectedSub로 남의 authorizationCode를 끼워 넣는 케이스를 차단.
    const authorizationCode = typeof body.authorizationCode === 'string' ? body.authorizationCode : '';
    if (authorizationCode && isAppleRevocationConfigured()) {
      void (async () => {
        try {
          const { refreshToken } = await exchangeAppleAuthorizationCode(authorizationCode, {
            expectedSub: payload.sub,
          });
          await getAuthRepository().updateSocialRefreshToken({
            token: accessToken,
            provider: 'apple',
            refreshToken,
          });
        } catch (error) {
          console.error(
            `[runningground-backend] 애플 refresh token 교환 실패 (로그인은 정상 진행): ${error?.message ?? error}`,
          );
        }
      })();
    }

    return true;
  }

  const match = pathname.match(SOCIAL_PATH_PATTERN);

  if (!match || method !== 'GET') {
    return false;
  }

  const provider = match[1];
  const action = match[2];
  const providerConfig = resolveSocialProviderConfig(provider, backendConfig);

  if (action === 'start') {
    const appRedirect = safeAppRedirect(url.searchParams.get('app_redirect'));

    if (!providerConfig) {
      redirectTo(response, appReturnUrl(appRedirect, { error: 'not_configured' }));
      return true;
    }

    const state = encodeState({ nonce: crypto.randomUUID(), appRedirect });
    const authorizeUrl = buildSocialAuthorizeUrl({
      provider,
      clientId: providerConfig.clientId,
      redirectUri: callbackUrl(provider),
      state,
    });
    redirectTo(response, authorizeUrl);
    return true;
  }

  // action === 'callback'
  const stateRaw = url.searchParams.get('state');
  const appRedirect = safeAppRedirect(decodeState(stateRaw)?.appRedirect);
  const providerError = url.searchParams.get('error');
  const code = url.searchParams.get('code');

  if (!providerConfig) {
    redirectTo(response, appReturnUrl(appRedirect, { error: 'not_configured' }));
    return true;
  }

  if (providerError || !code) {
    // 운영 진단: 소셜 콜백 실패는 앱으로 조용히 돌려보내 클라 화면엔 안내만 뜬다 —
    // 서버 로그가 없으면 재발 시 원인 추적이 불가능해 한 줄 남긴다 (코드/토큰 비기록).
    console.error(
      `[runningground-backend] 소셜 콜백 실패(${provider}): ${providerError || 'code 없음'}`,
    );
    redirectTo(response, appReturnUrl(appRedirect, { error: providerError || 'no_code' }));
    return true;
  }

  try {
    const profile = await exchangeSocialAuthCode({
      provider,
      code,
      redirectUri: callbackUrl(provider),
      state: stateRaw ?? undefined,
      clientId: providerConfig.clientId,
      clientSecret: providerConfig.clientSecret,
    });
    const { accessToken, isNewUser } = await getAuthRepository().findOrCreateSocialUser(profile);
    // Newly-created accounts carry created=1 so the app routes them through the
    // onboarding tutorial (permission gate); returning users go straight to home.
    redirectTo(
      response,
      appReturnUrl(appRedirect, isNewUser ? { token: accessToken, created: '1' } : { token: accessToken }),
    );
  } catch (error) {
    // 교환/가입 실패 — 앱으로 돌려보내되 서버엔 원인을 남긴다 (코드/토큰 비기록).
    console.error(
      `[runningground-backend] 소셜 로그인 교환 실패(${provider}): ${error?.message ?? error}`,
    );
    redirectTo(response, appReturnUrl(appRedirect, { error: 'auth_failed' }));
  }

  return true;
}
