import { Platform } from 'react-native';
import { ApiError, type ApiErrorKind } from './apiError';
export { ApiError, getApiErrorMessage, isApiError } from './apiError';
export type { ApiErrorKind } from './apiError';

type ApiRequestOptions = {
  accessToken?: string | null;
  fallbackMessage?: string;
  headers?: HeadersInit;
  signal?: AbortSignal;
  // Per-request abort timeout. Defaults to API_CONFIG.timeoutMs. Hot, retried live-match
  // calls (progress heartbeat, live-share sync) pass a tighter value so one stalled
  // request aborts fast and frees the single-flight slot for the next tick instead of
  // freezing progress for the full default timeout.
  timeoutMs?: number;
};

// Tight timeout for high-frequency, retried live-match requests. Well above a healthy
// backend's sub-second latency, far below the default so a network/backend stall can't
// freeze live progress for ~10s.
export const LIVE_MATCH_REQUEST_TIMEOUT_MS = 5000;

type ApiHealthResponse = {
  status?: string;
  message?: string;
  publicBaseUrl?: string;
};

type ApiResponseTimingMetadata = {
  clientRequestStartedAtMs: number;
  clientResponseReceivedAtMs: number;
};

function readBooleanEnv(value: string | undefined, fallbackValue: boolean) {
  if (!value) {
    return fallbackValue;
  }

  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function readNumberEnv(value: string | undefined, fallbackValue: number) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) && nextValue > 0 ? nextValue : fallbackValue;
}

function normalizeBaseUrl(value: string | undefined) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return Platform.OS === 'android' ? 'http://10.0.2.2:8081/api' : 'http://localhost:8081/api';
  }

  return trimmedValue.replace(/\/+$/, '');
}

// Expo inlines EXPO_PUBLIC_* values only when they are referenced directly.
const expoPublicApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const expoPublicApiTimeoutMs = process.env.EXPO_PUBLIC_API_TIMEOUT_MS;
const expoPublicUseMockApi = process.env.EXPO_PUBLIC_USE_MOCK_API;

export const API_CONFIG = {
  baseUrl: normalizeBaseUrl(expoPublicApiBaseUrl),
  timeoutMs: readNumberEnv(expoPublicApiTimeoutMs, 10000),
};

export const USE_MOCK_API = readBooleanEnv(expoPublicUseMockApi, false);

function getResponseErrorKind(status: number): ApiErrorKind {
  if (status === 401 || status === 403) {
    return 'auth';
  }

  if (status >= 500) {
    return 'server';
  }

  return 'request';
}

// Fired when an AUTHENTICATED request (one that sent a Bearer token) comes back 401 —
// i.e. the session was invalidated server-side (e.g. the account logged in on another
// device). Registered once at app start to sign the user out. Not fired for login/
// signup 401s, which carry no token.
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

function buildResponseErrorMessage(kind: ApiErrorKind, fallbackMessage: string) {
  switch (kind) {
    case 'auth':
      return '로그인이 만료됐거나 권한이 없어요. 다시 로그인한 뒤 시도해주세요.';
    case 'server':
      return `${fallbackMessage} 서버에서 문제가 발생했어요. 잠시 후 다시 시도해주세요.`;
    case 'request':
      return fallbackMessage;
    default:
      return fallbackMessage;
  }
}

function attachResponseTimingMetadata<T>(payload: T, metadata: ApiResponseTimingMetadata): T {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return payload;
  }

  Object.defineProperties(payload, {
    clientRequestStartedAtMs: {
      value: metadata.clientRequestStartedAtMs,
      enumerable: true,
      configurable: true,
    },
    clientResponseReceivedAtMs: {
      value: metadata.clientResponseReceivedAtMs,
      enumerable: true,
      configurable: true,
    },
  });

  return payload;
}

async function readErrorPayload(response: Response, fallbackMessage: string) {
  try {
    const contentType = response.headers.get('content-type') ?? '';
    const rawBody = await response.text();

    if (!rawBody.trim()) {
      return {
        details: null,
        message: fallbackMessage,
      };
    }

    if (contentType.includes('application/json')) {
      const payload = JSON.parse(rawBody);

      if (typeof payload?.message === 'string') {
        return {
          details: payload,
          message: payload.message,
        };
      }

      if (Array.isArray(payload?.message) && typeof payload.message[0] === 'string') {
        return {
          details: payload,
          message: payload.message[0],
        };
      }

      return {
        details: payload,
        message: fallbackMessage,
      };
    }

    if (contentType.includes('text/html')) {
      return {
        details: rawBody.slice(0, 500),
        message: `${fallbackMessage} (공개 터널 또는 프록시 응답 오류)`,
      };
    }
  } catch {
    return {
      details: null,
      message: fallbackMessage,
    };
  }

  return {
    details: null,
    message: fallbackMessage,
  };
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit,
  { accessToken, fallbackMessage = '요청 처리에 실패했어.', headers: optionHeaders, signal, timeoutMs }: ApiRequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? API_CONFIG.timeoutMs);
  const headers = new Headers(init.headers ?? {});
  let removeExternalAbortListener: (() => void) | null = null;

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      const abortFromExternalSignal = () => {
        controller.abort();
      };
      signal.addEventListener('abort', abortFromExternalSignal, { once: true });
      removeExternalAbortListener = () => {
        signal.removeEventListener('abort', abortFromExternalSignal);
      };
    }
  }

  if (optionHeaders) {
    new Headers(optionHeaders).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  headers.set('Accept', 'application/json');

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  try {
    const requestStartedAtMs = Date.now();
    const response = await fetch(`${API_CONFIG.baseUrl}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    const responseReceivedAtMs = Date.now();

    if (!response.ok) {
      const kind = getResponseErrorKind(response.status);

      // An authenticated request rejected with 401 means our token is no longer valid
      // (most commonly: this account logged in on another device). Sign out globally.
      if (accessToken && response.status === 401) {
        unauthorizedHandler?.();
      }

      const payload = await readErrorPayload(response, fallbackMessage);
      const responseMessage = payload.message || buildResponseErrorMessage(kind, fallbackMessage);

      throw new ApiError(kind, responseMessage, {
        details: payload.details,
        status: response.status,
        statusText: response.statusText,
        userMessage: responseMessage,
      });
    }

    const contentType = response.headers.get('content-type') ?? '';
    const rawBody = await response.text();

    if (!rawBody.trim()) {
      throw new ApiError('empty', `${fallbackMessage} 서버 응답이 비어 있어요.`, {
        status: response.status,
        statusText: response.statusText,
      });
    }

    if (!contentType.includes('application/json')) {
      throw new ApiError('invalid-json', `${fallbackMessage} 서버 응답 형식이 올바르지 않아요.`, {
        details: rawBody.slice(0, 500),
        status: response.status,
        statusText: response.statusText,
      });
    }

    try {
      return attachResponseTimingMetadata(JSON.parse(rawBody) as T, {
        clientRequestStartedAtMs: requestStartedAtMs,
        clientResponseReceivedAtMs: responseReceivedAtMs,
      });
    } catch (parseError) {
      throw new ApiError('invalid-json', `${fallbackMessage} 서버 응답을 해석하지 못했어요.`, {
        cause: parseError,
        details: rawBody.slice(0, 500),
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('timeout', `요청 시간이 초과됐어요. 현재 API 주소: ${API_CONFIG.baseUrl}`, {
        cause: error,
      });
    }

    if (error instanceof Error && /network request failed|load failed|failed to fetch/i.test(error.message)) {
      throw new ApiError('network', `서버에 연결하지 못했어요. 현재 API 주소: ${API_CONFIG.baseUrl}`, {
        cause: error,
      });
    }

    throw error;
  } finally {
    clearTimeout(timeout);
    removeExternalAbortListener?.();
  }
}

export async function apiGet<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  return apiRequest<T>(path, { method: 'GET' }, options);
}

export async function apiPost<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
  return apiRequest<T>(
    path,
    {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    options,
  );
}

export async function apiPatch<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
  return apiRequest<T>(
    path,
    {
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    options,
  );
}

export async function apiDelete<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  return apiRequest<T>(
    path,
    {
      method: 'DELETE',
    },
    options,
  );
}

export async function checkApiHealth(): Promise<ApiHealthResponse> {
  return apiGet<ApiHealthResponse>('/health', {
    fallbackMessage: '서버 연결 확인에 실패했어요.',
  });
}
