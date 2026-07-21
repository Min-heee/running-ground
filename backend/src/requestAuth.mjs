import { randomBytes } from 'node:crypto';
import { ADMIN_TOKEN } from './config.mjs';
import { isSessionExpired } from './auth.mjs';
import { ApiError } from './response/httpResponse.mjs';

export function createToken() {
  return randomBytes(24).toString('hex');
}

export function getAccessToken(request) {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    throw new ApiError(401, '로그인이 필요해요.');
  }

  return authorization.slice('Bearer '.length).trim();
}

export function findUserByToken(store, token) {
  const session = store.sessions.find((entry) => entry.token === token);

  if (!session) {
    throw new ApiError(401, '세션이 만료됐어요. 다시 로그인해주세요.');
  }

  if (isSessionExpired(session)) {
    throw new ApiError(401, '세션이 만료됐어요. 다시 로그인해주세요.');
  }

  const user = store.users.find((entry) => entry.id === session.userId);

  if (!user) {
    throw new ApiError(401, '세션 사용자를 찾을 수 없어요.');
  }

  return user;
}

export function requireUser(store, request) {
  return findUserByToken(store, getAccessToken(request));
}

export function requireAdmin(request) {
  if (!ADMIN_TOKEN) {
    throw new ApiError(404, '관리자 기능이 아직 설정되지 않았어.');
  }

  const providedToken = String(request.headers['x-admin-token'] ?? '').trim();

  if (!providedToken || providedToken !== ADMIN_TOKEN) {
    throw new ApiError(401, '관리자 토큰이 올바르지 않아요.');
  }
}
