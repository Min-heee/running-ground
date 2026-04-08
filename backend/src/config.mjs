import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFilePath = fileURLToPath(import.meta.url);
const sourceDirectory = dirname(currentFilePath);
const backendDirectory = resolve(sourceDirectory, '..');
const projectDirectory = resolve(backendDirectory, '..');
const backendEnvPath = join(backendDirectory, '.env');

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const fileContents = readFileSync(filePath, 'utf8');
  const lines = fileContents.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseBoolean(value, defaultValue = false) {
  if (typeof value !== 'string') {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function parseNumber(value, defaultValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function resolveConfiguredPath(filePath, fallbackPath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return fallbackPath;
  }

  return isAbsolute(filePath) ? filePath : resolve(projectDirectory, filePath);
}

loadEnvFile(backendEnvPath);

const defaultStoreFile = join(backendDirectory, 'data', 'store.json');

export const BACKEND_DIRECTORIES = {
  projectDirectory,
  backendDirectory,
  sourceDirectory,
};

export const BACKEND_ENV_PATH = backendEnvPath;
export const HOST = process.env.BACKEND_HOST ?? process.env.HOST ?? '0.0.0.0';
export const PORT = parseNumber(process.env.BACKEND_PORT ?? process.env.PORT, 8081);
export const CORS_ORIGIN = process.env.BACKEND_CORS_ORIGIN ?? '*';
export const STORE_FILE = resolveConfiguredPath(process.env.BACKEND_STORE_FILE, defaultStoreFile);
export const ADMIN_TOKEN = process.env.BACKEND_ADMIN_TOKEN ?? '';
export const ENABLE_ADMIN_STATUS = Boolean(ADMIN_TOKEN) && parseBoolean(process.env.BACKEND_ENABLE_ADMIN_STATUS, true);
export const ENABLE_RESET_ENDPOINT = Boolean(ADMIN_TOKEN) && parseBoolean(process.env.BACKEND_ENABLE_RESET_ENDPOINT, false);

export function getPublicBackendConfig() {
  return {
    host: HOST,
    port: PORT,
    corsOrigin: CORS_ORIGIN,
    storeFile: STORE_FILE,
    adminStatusEnabled: ENABLE_ADMIN_STATUS,
    resetEndpointEnabled: ENABLE_RESET_ENDPOINT,
    usingEnvFile: existsSync(BACKEND_ENV_PATH),
  };
}
