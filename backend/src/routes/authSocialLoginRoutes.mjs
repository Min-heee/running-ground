import crypto from 'node:crypto';

import * as backendConfig from '../config.mjs';
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

export async function routeAuthSocialLoginRequest({ method, pathname, url, response, getAuthRepository }) {
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
  } catch {
    redirectTo(response, appReturnUrl(appRedirect, { error: 'auth_failed' }));
  }

  return true;
}
