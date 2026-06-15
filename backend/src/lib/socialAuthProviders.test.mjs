import assert from 'node:assert/strict';

import {
  SOCIAL_PROVIDERS,
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

  console.log('[socialAuthProviders] ok - exchange + config resolution');
}

run().catch((error) => {
  console.error('[socialAuthProviders] failed', error);
  process.exit(1);
});
