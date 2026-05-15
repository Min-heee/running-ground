import {
  CORS_ALLOW_ANY_ORIGIN,
  CORS_ORIGINS,
} from '../config.mjs';

export class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details && typeof details === 'object' ? details : null;
  }
}

export function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function logBackendError(label, error, extra = {}) {
  console.error(JSON.stringify({
    level: 'error',
    service: 'runningground-backend',
    label,
    message: getErrorMessage(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...extra,
  }));
}

export function logBackendInfo(label, extra = {}) {
  console.log(JSON.stringify({
    level: 'info',
    service: 'runningground-backend',
    label,
    ...extra,
  }));
}

function resolveCorsOrigin(request) {
  const requestOrigin = typeof request.headers.origin === 'string' ? request.headers.origin.trim() : '';

  if (CORS_ALLOW_ANY_ORIGIN) {
    return '*';
  }

  if (!requestOrigin) {
    return '';
  }

  return CORS_ORIGINS.includes(requestOrigin) ? requestOrigin : '';
}

export function buildCorsHeaders(request) {
  const resolvedOrigin = resolveCorsOrigin(request);
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };

  if (resolvedOrigin) {
    headers['Access-Control-Allow-Origin'] = resolvedOrigin;
  }

  return headers;
}

export function applyCorsHeaders(request, response) {
  const headers = buildCorsHeaders(request);

  for (const [key, value] of Object.entries(headers)) {
    response.setHeader(key, value);
  }
}

export function sendJson(response, statusCode, payload) {
  if (response.writableEnded || response.destroyed) {
    return;
  }

  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

export function sendError(response, error) {
  if (response.writableEnded || response.destroyed) {
    return;
  }

  if (error instanceof ApiError) {
    sendJson(response, error.statusCode, {
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  logBackendError('request_failed', error);
  sendJson(response, 500, { message: '서버에서 요청 처리 중 문제가 생겼어요.' });
}
