import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  APPLE_AUDIENCE,
  resetAppleJwksCacheForTest,
  verifyAppleIdentityToken,
} from './appleIdentityToken.mjs';

function runTest(name, testFn) {
  return Promise.resolve()
    .then(testFn)
    .then(() => console.log(`[appleIdentityToken] ok - ${name}`))
    .catch((error) => {
      console.error(`[appleIdentityToken] failed - ${name}`);
      throw error;
    });
}

// Local RSA pair standing in for Apple's signing key; the JWKS fetch is injected.
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-kid', alg: 'RS256', use: 'sig' };
const fetchJwks = async () => ({ keys: [jwk] });

const NOW_MS = 1_800_000_000_000;

function signToken(payloadOverrides = {}, headerOverrides = {}) {
  const header = { alg: 'RS256', kid: 'test-kid', ...headerOverrides };
  const payload = {
    iss: 'https://appleid.apple.com',
    aud: APPLE_AUDIENCE,
    exp: Math.floor(NOW_MS / 1000) + 600,
    sub: 'apple-user-001',
    email: 'runner@example.com',
    ...payloadOverrides,
  };
  const headerSegment = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadSegment = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${headerSegment}.${payloadSegment}`), privateKey);
  return `${headerSegment}.${payloadSegment}.${signature.toString('base64url')}`;
}

await runTest('a valid token verifies and returns the payload', async () => {
  resetAppleJwksCacheForTest();
  const payload = await verifyAppleIdentityToken(signToken(), { fetchJwks, nowMs: NOW_MS });

  assert.equal(payload.sub, 'apple-user-001');
  assert.equal(payload.email, 'runner@example.com');
});

await runTest('wrong audience is rejected', async () => {
  resetAppleJwksCacheForTest();
  await assert.rejects(
    () => verifyAppleIdentityToken(signToken({ aud: 'com.evil.app' }), { fetchJwks, nowMs: NOW_MS }),
    /대상 앱/,
  );
});

await runTest('wrong issuer is rejected', async () => {
  resetAppleJwksCacheForTest();
  await assert.rejects(
    () => verifyAppleIdentityToken(signToken({ iss: 'https://evil.example.com' }), { fetchJwks, nowMs: NOW_MS }),
    /발급자/,
  );
});

await runTest('expired token is rejected', async () => {
  resetAppleJwksCacheForTest();
  await assert.rejects(
    () => verifyAppleIdentityToken(signToken({ exp: Math.floor(NOW_MS / 1000) - 10 }), { fetchJwks, nowMs: NOW_MS }),
    /만료/,
  );
});

await runTest('a tampered payload fails signature verification', async () => {
  resetAppleJwksCacheForTest();
  const token = signToken();
  const [header, , signature] = token.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({
    iss: 'https://appleid.apple.com',
    aud: APPLE_AUDIENCE,
    exp: Math.floor(NOW_MS / 1000) + 600,
    sub: 'someone-else',
  })).toString('base64url');

  await assert.rejects(
    () => verifyAppleIdentityToken(`${header}.${forgedPayload}.${signature}`, { fetchJwks, nowMs: NOW_MS }),
    /서명 검증/,
  );
});

await runTest('unknown signing key is rejected', async () => {
  resetAppleJwksCacheForTest();
  await assert.rejects(
    () => verifyAppleIdentityToken(signToken({}, { kid: 'other-kid' }), { fetchJwks, nowMs: NOW_MS }),
    /서명 키/,
  );
});

await runTest('garbage input is rejected', async () => {
  resetAppleJwksCacheForTest();
  await assert.rejects(() => verifyAppleIdentityToken('not-a-jwt', { fetchJwks, nowMs: NOW_MS }), /형식/);
});
