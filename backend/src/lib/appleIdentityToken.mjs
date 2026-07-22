import crypto from 'node:crypto';

// Sign in with Apple identity-token verification (App Review 4.8 follow-up).
//
// The iOS native sheet hands the client an identityToken — an RS256 JWT signed
// by Apple. The client posts it to /api/auth/apple/token and THIS module is the
// server-side truth: verify the signature against Apple's published JWKS and
// check issuer / audience / expiry before trusting the embedded user identity
// (`sub` is the stable per-user id). No third-party JWT dependency — Node 20's
// crypto imports JWKs natively.

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
// The iOS app's bundle identifier — the token's audience.
export const APPLE_AUDIENCE = 'com.minheee.runnigapp';

const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

let cachedJwks = null;
let cachedJwksAtMs = 0;

async function fetchAppleJwksDefault() {
  const response = await fetch(APPLE_JWKS_URL);

  if (!response.ok) {
    throw new Error(`Apple JWKS fetch failed: ${response.status}`);
  }

  return response.json();
}

function decodeBase64UrlJson(segment, label) {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    throw new Error(`애플 토큰의 ${label}을 읽을 수 없어요.`);
  }
}

// Verify + decode. Returns the token payload ({ sub, email?, email_verified?, … }).
// Throws on ANY validation failure — the route maps every throw to a 401.
export async function verifyAppleIdentityToken(identityToken, {
  audience = APPLE_AUDIENCE,
  fetchJwks = fetchAppleJwksDefault,
  nowMs = Date.now(),
} = {}) {
  const segments = String(identityToken ?? '').split('.');

  if (segments.length !== 3) {
    throw new Error('애플 토큰 형식이 올바르지 않아요.');
  }

  const [headerSegment, payloadSegment, signatureSegment] = segments;
  const header = decodeBase64UrlJson(headerSegment, '헤더');

  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    throw new Error('애플 토큰 서명 방식이 올바르지 않아요.');
  }

  // JWKS with a 1h cache; on a kid miss (key rotation) refetch once.
  let jwks = cachedJwks && nowMs - cachedJwksAtMs < JWKS_CACHE_TTL_MS ? cachedJwks : null;
  if (!jwks) {
    jwks = await fetchJwks();
    cachedJwks = jwks;
    cachedJwksAtMs = nowMs;
  }

  let jwk = jwks?.keys?.find((key) => key.kid === header.kid);
  if (!jwk) {
    jwks = await fetchJwks();
    cachedJwks = jwks;
    cachedJwksAtMs = nowMs;
    jwk = jwks?.keys?.find((key) => key.kid === header.kid);
  }

  if (!jwk) {
    throw new Error('애플 서명 키를 찾을 수 없어요.');
  }

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const signatureValid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerSegment}.${payloadSegment}`),
    publicKey,
    Buffer.from(signatureSegment, 'base64url'),
  );

  if (!signatureValid) {
    throw new Error('애플 토큰 서명 검증에 실패했어요.');
  }

  const payload = decodeBase64UrlJson(payloadSegment, '본문');

  if (payload.iss !== APPLE_ISSUER) {
    throw new Error('애플 토큰 발급자가 올바르지 않아요.');
  }

  if (payload.aud !== audience) {
    throw new Error('애플 토큰 대상 앱이 올바르지 않아요.');
  }

  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= nowMs) {
    throw new Error('애플 토큰이 만료됐어요.');
  }

  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('애플 토큰에 사용자 식별자가 없어요.');
  }

  return payload;
}

// Test seam: reset the module-level JWKS cache between cases.
export function resetAppleJwksCacheForTest() {
  cachedJwks = null;
  cachedJwksAtMs = 0;
}
