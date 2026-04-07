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
    return 'http://localhost:8081/api';
  }

  return trimmedValue.replace(/\/+$/, '');
}

const expoPublicEnv = (
  globalThis as typeof globalThis & {
    process?: {
      env?: Record<string, string | undefined>;
    };
  }
).process?.env ?? {};

export const API_CONFIG = {
  baseUrl: normalizeBaseUrl(expoPublicEnv.EXPO_PUBLIC_API_BASE_URL),
  timeoutMs: readNumberEnv(expoPublicEnv.EXPO_PUBLIC_API_TIMEOUT_MS, 10000),
};

export const USE_MOCK_API = readBooleanEnv(expoPublicEnv.EXPO_PUBLIC_USE_MOCK_API, true);
