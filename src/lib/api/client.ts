import { API_CONFIG } from './config';

type ApiRequestOptions = {
  accessToken?: string | null;
  fallbackMessage?: string;
};

async function readErrorMessage(response: Response, fallbackMessage: string) {
  try {
    const payload = await response.json();

    if (typeof payload?.message === 'string') {
      return payload.message;
    }

    if (Array.isArray(payload?.message) && typeof payload.message[0] === 'string') {
      return payload.message[0];
    }
  } catch {
    return fallbackMessage;
  }

  return fallbackMessage;
}

async function apiRequest<T>(
  path: string,
  init: RequestInit,
  { accessToken, fallbackMessage = '요청 처리에 실패했어.' }: ApiRequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_CONFIG.timeoutMs);
  const headers = new Headers(init.headers ?? {});

  headers.set('Accept', 'application/json');

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  try {
    const response = await fetch(`${API_CONFIG.baseUrl}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, fallbackMessage));
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`요청 시간이 초과됐어요. 현재 API 주소: ${API_CONFIG.baseUrl}`);
    }

    if (error instanceof Error && /network request failed|load failed|failed to fetch/i.test(error.message)) {
      throw new Error(`서버에 연결하지 못했어요. 현재 API 주소: ${API_CONFIG.baseUrl}`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
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
