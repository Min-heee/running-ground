import crypto from 'node:crypto';

import {
  APPLE_SIGNIN_KEY_ID,
  APPLE_SIGNIN_PRIVATE_KEY,
  APPLE_SIGNIN_TEAM_ID,
} from '../config.mjs';
import { APPLE_AUDIENCE } from './appleIdentityToken.mjs';

// Sign in with Apple 토큰 철회 (가이드라인 5.1.1: 애플 로그인 앱은 계정 삭제 시
// 애플 토큰을 철회해야 한다).
//
// 흐름: 로그인 때 네이티브 시트의 authorizationCode를 /auth/token 으로 교환해
// refresh token을 유저 레코드에 저장해 두고, 탈퇴/관리자 삭제 때 /auth/revoke 로
// 철회한다. 두 호출 모두 client_secret = 개발자 포털에서 발급한 Sign in with
// Apple 키(.p8, ES256)로 서명한 단명 JWT.
//
// env 3개(BACKEND_APPLE_SIGNIN_TEAM_ID / _KEY_ID / _PRIVATE_KEY)가 전부 있어야
// 활성화되고, 없으면 모든 진입점이 조용히 건너뛴다 (로그인·탈퇴는 항상 동작).

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const CLIENT_SECRET_TTL_SECONDS = 300;
const REQUEST_TIMEOUT_MS = 5000;

export function isAppleRevocationConfigured() {
  return Boolean(APPLE_SIGNIN_TEAM_ID && APPLE_SIGNIN_KEY_ID && APPLE_SIGNIN_PRIVATE_KEY);
}

// .env 는 한 줄 값이 안전하므로 base64(p8 PEM)를 권장하되, \n 이스케이프된
// 원문 PEM도 받는다.
export function resolveApplePrivateKeyPem(rawValue) {
  const value = String(rawValue ?? '').trim();

  if (!value) {
    throw new Error('애플 로그인 개인키가 설정되지 않았어요.');
  }

  if (value.includes('BEGIN PRIVATE KEY')) {
    return value.replace(/\\n/g, '\n');
  }

  const decoded = Buffer.from(value, 'base64').toString('utf8');

  if (!decoded.includes('BEGIN PRIVATE KEY')) {
    throw new Error('애플 로그인 개인키 형식을 읽을 수 없어요 (.p8 원문 또는 base64).');
  }

  return decoded;
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

// ES256(P-256) client secret JWT. JWT 서명은 DER이 아니라 raw R||S(ieee-p1363).
export function buildAppleClientSecret({
  teamId = APPLE_SIGNIN_TEAM_ID,
  keyId = APPLE_SIGNIN_KEY_ID,
  privateKey = APPLE_SIGNIN_PRIVATE_KEY,
  clientId = APPLE_AUDIENCE,
  nowMs = Date.now(),
} = {}) {
  const issuedAtSeconds = Math.floor(nowMs / 1000);
  const header = base64UrlJson({ alg: 'ES256', kid: keyId, typ: 'JWT' });
  const payload = base64UrlJson({
    iss: teamId,
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + CLIENT_SECRET_TTL_SECONDS,
    aud: 'https://appleid.apple.com',
    sub: clientId,
  });
  const signingInput = `${header}.${payload}`;
  const key = crypto.createPrivateKey(resolveApplePrivateKeyPem(privateKey));
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key,
    dsaEncoding: 'ieee-p1363',
  });

  return `${signingInput}.${signature.toString('base64url')}`;
}

async function postAppleForm(url, form, fetchImpl) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  return response;
}

function decodeJwtSub(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(String(jwt).split('.')[1] ?? '', 'base64url').toString('utf8'));
    return typeof payload?.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

// 로그인 직후 authorizationCode → refresh token 교환. 실패는 throw — 호출부가
// best-effort로 삼킨다 (로그인 자체는 절대 막지 않는다).
export async function exchangeAppleAuthorizationCode(authorizationCode, {
  clientId = APPLE_AUDIENCE,
  clientSecret,
  // 로그인 identityToken의 sub — 교환 응답의 id_token.sub와 대조해, 남의
  // authorizationCode를 끼워 넣어 타인의 refresh token을 내 계정에 묶는
  // 꼼수를 차단한다 (TLS로 애플에서 직접 받은 응답이라 서명 재검증은 불필요).
  expectedSub,
  fetchImpl = fetch,
  nowMs = Date.now(),
} = {}) {
  const code = String(authorizationCode ?? '').trim();

  if (!code) {
    throw new Error('애플 인증 코드가 비어 있어요.');
  }

  const response = await postAppleForm(APPLE_TOKEN_URL, {
    client_id: clientId,
    client_secret: clientSecret ?? buildAppleClientSecret({ clientId, nowMs }),
    code,
    grant_type: 'authorization_code',
  }, fetchImpl);

  if (!response.ok) {
    throw new Error(`애플 토큰 교환 실패: ${response.status}`);
  }

  const body = await response.json();

  if (typeof body?.refresh_token !== 'string' || !body.refresh_token) {
    throw new Error('애플 토큰 교환 응답에 refresh_token이 없어요.');
  }

  if (expectedSub) {
    const exchangedSub = decodeJwtSub(body.id_token);

    if (exchangedSub !== expectedSub) {
      throw new Error('애플 토큰 교환 응답의 사용자와 로그인 사용자가 달라요.');
    }
  }

  return { refreshToken: body.refresh_token };
}

// 탈퇴/삭제 시 철회. 실패는 throw — 호출부가 로그만 남기고 삭제는 계속한다.
export async function revokeAppleRefreshToken(refreshToken, {
  clientId = APPLE_AUDIENCE,
  clientSecret,
  fetchImpl = fetch,
  nowMs = Date.now(),
} = {}) {
  const token = String(refreshToken ?? '').trim();

  if (!token) {
    throw new Error('철회할 애플 refresh token이 없어요.');
  }

  const response = await postAppleForm(APPLE_REVOKE_URL, {
    client_id: clientId,
    client_secret: clientSecret ?? buildAppleClientSecret({ clientId, nowMs }),
    token,
    token_type_hint: 'refresh_token',
  }, fetchImpl);

  if (!response.ok) {
    throw new Error(`애플 토큰 철회 실패: ${response.status}`);
  }

  return { success: true };
}
