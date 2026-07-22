import { ApiError } from '../response/httpResponse.mjs';

// Server-side social OAuth: the client runs the provider's web OAuth (PKCE) and sends us the
// authorization `code`; here we exchange it for an access token and read the profile. Endpoints
// are the long-stable OAuth 2.0 ones for each provider — double-check against the provider
// console if a request ever 400s.

export const SOCIAL_PROVIDERS = ['google', 'kakao', 'naver'];

export const SOCIAL_PROVIDER_LABEL = {
  apple: '애플',
  google: '구글',
  kakao: '카카오',
  naver: '네이버',
};

function normalizeText(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function readJson(httpResponse) {
  try {
    return await httpResponse.json();
  } catch {
    return null;
  }
}

const PROVIDER_DEFS = {
  google: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    buildTokenBody({ code, redirectUri, codeVerifier, clientId, clientSecret }) {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
      });
      if (clientSecret) body.set('client_secret', clientSecret);
      if (codeVerifier) body.set('code_verifier', codeVerifier);
      return body;
    },
    parseProfile(json) {
      return {
        providerUserId: normalizeText(json?.sub != null ? String(json.sub) : ''),
        email: normalizeText(json?.email),
        name: normalizeText(json?.name),
      };
    },
  },
  kakao: {
    tokenUrl: 'https://kauth.kakao.com/oauth/token',
    userInfoUrl: 'https://kapi.kakao.com/v2/user/me',
    buildTokenBody({ code, redirectUri, codeVerifier, clientId, clientSecret }) {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
      });
      if (clientSecret) body.set('client_secret', clientSecret);
      if (codeVerifier) body.set('code_verifier', codeVerifier);
      return body;
    },
    parseProfile(json) {
      const account = json?.kakao_account ?? {};
      const profile = account.profile ?? {};
      return {
        providerUserId: normalizeText(json?.id != null ? String(json.id) : ''),
        email: normalizeText(account.email),
        name: normalizeText(profile.nickname),
      };
    },
  },
  naver: {
    tokenUrl: 'https://nid.naver.com/oauth2.0/token',
    userInfoUrl: 'https://openapi.naver.com/v1/nid/me',
    buildTokenBody({ code, redirectUri, state, clientId, clientSecret }) {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
      });
      if (clientSecret) body.set('client_secret', clientSecret);
      if (redirectUri) body.set('redirect_uri', redirectUri);
      if (state) body.set('state', state);
      return body;
    },
    parseProfile(json) {
      const profile = json?.response ?? {};
      return {
        providerUserId: normalizeText(profile.id != null ? String(profile.id) : ''),
        email: normalizeText(profile.email),
        name: normalizeText(profile.name ?? profile.nickname),
      };
    },
  },
};

const AUTHORIZE_DEFS = {
  google: { url: 'https://accounts.google.com/o/oauth2/v2/auth', scope: 'openid email profile' },
  kakao: { url: 'https://kauth.kakao.com/oauth/authorize', scope: null },
  naver: { url: 'https://nid.naver.com/oauth2.0/authorize', scope: null },
};

// Builds the provider's authorize URL the in-app browser is sent to. redirectUri is our own
// backend callback (https), and state round-trips our app-return info.
export function buildSocialAuthorizeUrl({ provider, clientId, redirectUri, state }) {
  const def = AUTHORIZE_DEFS[provider];

  if (!def) {
    throw new ApiError(400, '지원하지 않는 소셜 로그인이에요.');
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });
  if (def.scope) {
    params.set('scope', def.scope);
  }

  return `${def.url}?${params.toString()}`;
}

// Returns { clientId, clientSecret } from backend config, or null when the provider isn't
// configured yet (so the route can answer 503 cleanly instead of a confusing provider error).
export function resolveSocialProviderConfig(provider, config) {
  const entry = {
    google: { clientId: config.GOOGLE_CLIENT_ID, clientSecret: config.GOOGLE_CLIENT_SECRET },
    kakao: { clientId: config.KAKAO_REST_API_KEY, clientSecret: config.KAKAO_CLIENT_SECRET },
    naver: { clientId: config.NAVER_CLIENT_ID, clientSecret: config.NAVER_CLIENT_SECRET },
  }[provider];

  if (!entry || !entry.clientId) {
    return null;
  }

  // Google/Naver require the client secret for the server-side code exchange; Kakao's is optional.
  if (provider !== 'kakao' && !entry.clientSecret) {
    return null;
  }

  return { clientId: entry.clientId, clientSecret: entry.clientSecret };
}

export async function exchangeSocialAuthCode({
  provider,
  code,
  redirectUri,
  codeVerifier,
  state,
  clientId,
  clientSecret,
  fetchImpl = fetch,
}) {
  const def = PROVIDER_DEFS[provider];

  if (!def) {
    throw new ApiError(400, '지원하지 않는 소셜 로그인이에요.');
  }

  const label = SOCIAL_PROVIDER_LABEL[provider] ?? provider;
  const tokenBody = def.buildTokenBody({ code, redirectUri, codeVerifier, state, clientId, clientSecret });

  const tokenResponse = await fetchImpl(def.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody.toString(),
  });
  const tokenJson = await readJson(tokenResponse);
  const accessToken = tokenJson?.access_token;

  if (!tokenResponse.ok || !accessToken) {
    throw new ApiError(401, `${label} 인증에 실패했어요. 다시 시도해주세요.`);
  }

  const userResponse = await fetchImpl(def.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const userJson = await readJson(userResponse);

  if (!userResponse.ok || !userJson) {
    throw new ApiError(401, `${label} 프로필을 가져오지 못했어요.`);
  }

  const profile = def.parseProfile(userJson);

  if (!profile.providerUserId) {
    throw new ApiError(401, `${label} 계정 식별에 실패했어요.`);
  }

  return { provider, ...profile };
}
