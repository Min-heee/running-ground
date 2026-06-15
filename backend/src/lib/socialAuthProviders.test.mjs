import assert from 'node:assert/strict';

import {
  SOCIAL_PROVIDERS,
  buildSocialAuthorizeUrl,
  exchangeSocialAuthCode,
  resolveSocialProviderConfig,
} from './socialAuthProviders.mjs';

function jsonResponse(ok, body) {
  return { ok, json: async () => body };
}

async function run() {
  assert.deepEqual(SOCIAL_PROVIDERS, ['google', 'kakao', 'naver']);

  // Google: token exchange → openid userinfo (sub/email/name).
  const googleFetch = async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) return jsonResponse(true, { access_token: 'g-tok' });
    if (url.includes('userinfo')) return jsonResponse(true, { sub: 'g-123', email: 'g@x.com', name: 'G User' });
    throw new Error(`unexpected url ${url}`);
  };
  assert.deepEqual(
    await exchangeSocialAuthCode({
      provider: 'google', code: 'c', redirectUri: 'runningground://oauth',
      codeVerifier: 'v', clientId: 'cid', clientSecret: 'sec', fetchImpl: googleFetch,
    }),
    { provider: 'google', providerUserId: 'g-123', email: 'g@x.com', name: 'G User' },
  );

  // Kakao: numeric id + kakao_account.{email,profile.nickname}.
  const kakaoFetch = async (url) => {
    if (url.includes('kauth.kakao.com/oauth/token')) return jsonResponse(true, { access_token: 'k-tok' });
    if (url.includes('kapi.kakao.com')) {
      return jsonResponse(true, { id: 777, kakao_account: { email: 'k@x.com', profile: { nickname: '카카오' } } });
    }
    throw new Error(`unexpected url ${url}`);
  };
  assert.deepEqual(
    await exchangeSocialAuthCode({
      provider: 'kakao', code: 'c', redirectUri: 'r', clientId: 'cid', fetchImpl: kakaoFetch,
    }),
    { provider: 'kakao', providerUserId: '777', email: 'k@x.com', name: '카카오' },
  );

  // Naver: response.{id,email,name}.
  const naverFetch = async (url) => {
    if (url.includes('nid.naver.com/oauth2.0/token')) return jsonResponse(true, { access_token: 'n-tok' });
    if (url.includes('openapi.naver.com')) return jsonResponse(true, { response: { id: 'n-9', email: 'n@x.com', name: '네이버' } });
    throw new Error(`unexpected url ${url}`);
  };
  assert.deepEqual(
    await exchangeSocialAuthCode({
      provider: 'naver', code: 'c', redirectUri: 'r', state: 's', clientId: 'cid', clientSecret: 'sec', fetchImpl: naverFetch,
    }),
    { provider: 'naver', providerUserId: 'n-9', email: 'n@x.com', name: '네이버' },
  );

  // A failed token exchange surfaces a 401-style error, not the userinfo step.
  await assert.rejects(
    () => exchangeSocialAuthCode({
      provider: 'google', code: 'c', redirectUri: 'r', clientId: 'cid', clientSecret: 'sec',
      fetchImpl: async () => jsonResponse(false, { error: 'invalid_grant' }),
    }),
    /인증에 실패/,
  );

  // resolveSocialProviderConfig: unconfigured / secret rules.
  assert.equal(resolveSocialProviderConfig('google', {}), null);
  assert.equal(resolveSocialProviderConfig('google', { GOOGLE_CLIENT_ID: 'x' }), null); // google needs a secret
  assert.deepEqual(
    resolveSocialProviderConfig('google', { GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y' }),
    { clientId: 'x', clientSecret: 'y' },
  );
  assert.deepEqual(
    resolveSocialProviderConfig('kakao', { KAKAO_REST_API_KEY: 'k' }), // kakao secret optional
    { clientId: 'k', clientSecret: undefined },
  );

  // buildSocialAuthorizeUrl: correct endpoint + params per provider.
  const googleUrl = new URL(buildSocialAuthorizeUrl({
    provider: 'google', clientId: 'gid', redirectUri: 'https://b/api/auth/google/callback', state: 'st',
  }));
  assert.equal(googleUrl.origin + googleUrl.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(googleUrl.searchParams.get('client_id'), 'gid');
  assert.equal(googleUrl.searchParams.get('redirect_uri'), 'https://b/api/auth/google/callback');
  assert.equal(googleUrl.searchParams.get('response_type'), 'code');
  assert.equal(googleUrl.searchParams.get('state'), 'st');
  assert.equal(googleUrl.searchParams.get('scope'), 'openid email profile');

  const naverUrl = new URL(buildSocialAuthorizeUrl({
    provider: 'naver', clientId: 'nid', redirectUri: 'https://b/api/auth/naver/callback', state: 'st2',
  }));
  assert.equal(naverUrl.origin + naverUrl.pathname, 'https://nid.naver.com/oauth2.0/authorize');
  assert.equal(naverUrl.searchParams.get('state'), 'st2');
  assert.equal(naverUrl.searchParams.get('scope'), null); // naver has no scope param

  console.log('[socialAuthProviders] ok - exchange + config resolution + authorize url');
}

run().catch((error) => {
  console.error('[socialAuthProviders] failed', error);
  process.exit(1);
});
