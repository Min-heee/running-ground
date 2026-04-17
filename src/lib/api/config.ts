import { Platform } from 'react-native';

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
