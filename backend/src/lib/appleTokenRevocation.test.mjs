import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
  buildAppleClientSecret,
  exchangeAppleAuthorizationCode,
  resolveApplePrivateKeyPem,
  revokeAppleRefreshToken,
} from './appleTokenRevocation.mjs';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

function buildFetchStub({ status = 200, body = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, form: new URLSearchParams(init.body) });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  };
  return { fetchImpl, calls };
}

test('resolveApplePrivateKeyPem accepts raw PEM (with escaped newlines) and base64', () => {
  // 입력 끝의 공백/개행은 trim된다 — createPrivateKey에는 무해.
  assert.equal(resolveApplePrivateKeyPem(PRIVATE_PEM), PRIVATE_PEM.trim());
  const escaped = PRIVATE_PEM.trim().replace(/\n/g, '\\n');
  assert.ok(resolveApplePrivateKeyPem(escaped).includes('\n'));
  const base64 = Buffer.from(PRIVATE_PEM, 'utf8').toString('base64');
  assert.equal(resolveApplePrivateKeyPem(base64), PRIVATE_PEM);
  assert.throws(() => resolveApplePrivateKeyPem('not-a-key'));
  assert.throws(() => resolveApplePrivateKeyPem(''));
});

test('buildAppleClientSecret signs a verifiable ES256 JWT with the Apple claims', () => {
  const nowMs = 1_760_000_000_000;
  const jwt = buildAppleClientSecret({
    teamId: 'TEAM123456',
    keyId: 'KEY1234567',
    privateKey: PRIVATE_PEM,
    clientId: 'com.minheee.runnigapp',
    nowMs,
  });
  const [headerSegment, payloadSegment, signatureSegment] = jwt.split('.');

  const header = decodeSegment(headerSegment);
  assert.equal(header.alg, 'ES256');
  assert.equal(header.kid, 'KEY1234567');

  const payload = decodeSegment(payloadSegment);
  assert.equal(payload.iss, 'TEAM123456');
  assert.equal(payload.sub, 'com.minheee.runnigapp');
  assert.equal(payload.aud, 'https://appleid.apple.com');
  assert.equal(payload.iat, Math.floor(nowMs / 1000));
  assert.ok(payload.exp > payload.iat && payload.exp <= payload.iat + 15777000);

  // JWT ES256 서명은 raw R||S — 공개키로 실제 검증이 되어야 한다.
  const valid = crypto.verify(
    'sha256',
    Buffer.from(`${headerSegment}.${payloadSegment}`),
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(signatureSegment, 'base64url'),
  );
  assert.equal(valid, true);
});

test('exchangeAppleAuthorizationCode posts the code grant and returns the refresh token', async () => {
  const { fetchImpl, calls } = buildFetchStub({ body: { refresh_token: 'r-token-1' } });

  const result = await exchangeAppleAuthorizationCode('auth-code-1', {
    clientId: 'com.minheee.runnigapp',
    clientSecret: 'secret-jwt',
    fetchImpl,
  });

  assert.deepEqual(result, { refreshToken: 'r-token-1' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://appleid.apple.com/auth/token');
  assert.equal(calls[0].form.get('grant_type'), 'authorization_code');
  assert.equal(calls[0].form.get('code'), 'auth-code-1');
  assert.equal(calls[0].form.get('client_id'), 'com.minheee.runnigapp');
  assert.equal(calls[0].form.get('client_secret'), 'secret-jwt');
});

test('exchangeAppleAuthorizationCode throws on empty code, HTTP failure, and missing refresh_token', async () => {
  const { fetchImpl } = buildFetchStub({ body: { refresh_token: 'x' } });
  await assert.rejects(() => exchangeAppleAuthorizationCode('', { clientSecret: 's', fetchImpl }));

  const failing = buildFetchStub({ status: 400 });
  await assert.rejects(
    () => exchangeAppleAuthorizationCode('code', { clientSecret: 's', fetchImpl: failing.fetchImpl }),
    /400/,
  );

  const noToken = buildFetchStub({ body: { access_token: 'only' } });
  await assert.rejects(
    () => exchangeAppleAuthorizationCode('code', { clientSecret: 's', fetchImpl: noToken.fetchImpl }),
    /refresh_token/,
  );
});

test('exchangeAppleAuthorizationCode binds the exchanged token to the login user via id_token.sub', async () => {
  const idTokenFor = (sub) => `h.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.s`;

  // sub 일치 → 통과.
  const matching = buildFetchStub({ body: { refresh_token: 'r1', id_token: idTokenFor('apple-sub-1') } });
  const result = await exchangeAppleAuthorizationCode('code', {
    clientSecret: 's',
    expectedSub: 'apple-sub-1',
    fetchImpl: matching.fetchImpl,
  });
  assert.deepEqual(result, { refreshToken: 'r1' });

  // 남의 authorizationCode(다른 sub) → 거절.
  const mismatched = buildFetchStub({ body: { refresh_token: 'r2', id_token: idTokenFor('someone-else') } });
  await assert.rejects(
    () => exchangeAppleAuthorizationCode('code', {
      clientSecret: 's',
      expectedSub: 'apple-sub-1',
      fetchImpl: mismatched.fetchImpl,
    }),
    /사용자가 달라요/,
  );

  // id_token이 아예 없거나 못 읽어도 expectedSub가 있으면 거절 (안전한 쪽으로).
  const missing = buildFetchStub({ body: { refresh_token: 'r3' } });
  await assert.rejects(
    () => exchangeAppleAuthorizationCode('code', {
      clientSecret: 's',
      expectedSub: 'apple-sub-1',
      fetchImpl: missing.fetchImpl,
    }),
    /사용자가 달라요/,
  );
});

test('revokeAppleRefreshToken posts the revoke form with the refresh token hint', async () => {
  const { fetchImpl, calls } = buildFetchStub();

  const result = await revokeAppleRefreshToken('r-token-9', {
    clientId: 'com.minheee.runnigapp',
    clientSecret: 'secret-jwt',
    fetchImpl,
  });

  assert.deepEqual(result, { success: true });
  assert.equal(calls[0].url, 'https://appleid.apple.com/auth/revoke');
  assert.equal(calls[0].form.get('token'), 'r-token-9');
  assert.equal(calls[0].form.get('token_type_hint'), 'refresh_token');
  assert.equal(calls[0].form.get('client_secret'), 'secret-jwt');
});

test('revokeAppleRefreshToken throws on empty token and HTTP failure', async () => {
  const { fetchImpl } = buildFetchStub();
  await assert.rejects(() => revokeAppleRefreshToken('', { clientSecret: 's', fetchImpl }));

  const failing = buildFetchStub({ status: 500 });
  await assert.rejects(
    () => revokeAppleRefreshToken('r', { clientSecret: 's', fetchImpl: failing.fetchImpl }),
    /500/,
  );
});
