export type ApiErrorKind = 'network' | 'timeout' | 'auth' | 'server' | 'request' | 'empty' | 'invalid-json' | 'unknown';

type ApiErrorOptions = {
  cause?: unknown;
  details?: unknown;
  status?: number;
  statusText?: string;
  userMessage?: string;
};

export class ApiError extends Error {
  readonly cause?: unknown;
  readonly details?: unknown;
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly statusText?: string;
  readonly userMessage: string;

  constructor(kind: ApiErrorKind, message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options.status;
    this.statusText = options.statusText;
    this.userMessage = options.userMessage ?? message;
    this.details = options.details;
    this.cause = options.cause;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function getApiErrorMessage(error: unknown, fallbackMessage = '요청 처리에 실패했어.') {
  if (error instanceof ApiError) {
    return error.userMessage;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallbackMessage;
}
