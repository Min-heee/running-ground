import * as backendConfig from '../config.mjs';
import {
  SOCIAL_PROVIDERS,
  exchangeSocialAuthCode,
  resolveSocialProviderConfig,
} from '../lib/socialAuthProviders.mjs';

// POST /api/auth/social — the client ran the provider's web OAuth (PKCE) and sends us the
// authorization code; we exchange it server-side (where the client secret lives), read the
// profile, and find-or-create the matching user, returning the same { accessToken, user }
// payload as password login so the client session logic is unchanged.
export async function routeAuthSocialLoginRequest({
  method,
  pathname,
  request,
  response,
  sendJson,
  getAuthRepository,
  parseJsonBody,
  validateRequiredString,
  ApiError,
}) {
  if (pathname === '/api/auth/social' && method === 'POST') {
    await handleSocialLogin({
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

  return false;
}

async function handleSocialLogin({
  ApiError,
  getAuthRepository,
  parseJsonBody,
  request,
  response,
  sendJson,
  validateRequiredString,
}) {
  const body = await parseJsonBody(request);
  const provider = validateRequiredString(body.provider, '소셜 제공자를 지정해주세요.').toLowerCase();

  if (!SOCIAL_PROVIDERS.includes(provider)) {
    throw new ApiError(400, '지원하지 않는 소셜 로그인이에요.');
  }

  const code = validateRequiredString(body.code, '소셜 인증 코드가 없어요.');
  const redirectUri = validateRequiredString(body.redirectUri, '리다이렉트 주소가 없어요.');
  const providerConfig = resolveSocialProviderConfig(provider, backendConfig);

  if (!providerConfig) {
    throw new ApiError(503, '소셜 로그인이 아직 서버에 설정되지 않았어요. 잠시 후 다시 시도해주세요.');
  }

  const profile = await exchangeSocialAuthCode({
    provider,
    code,
    redirectUri,
    codeVerifier: typeof body.codeVerifier === 'string' ? body.codeVerifier : undefined,
    state: typeof body.state === 'string' ? body.state : undefined,
    clientId: providerConfig.clientId,
    clientSecret: providerConfig.clientSecret,
  });

  const result = await getAuthRepository().findOrCreateSocialUser(profile);

  sendJson(response, 200, result);
}
