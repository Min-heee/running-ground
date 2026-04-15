import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  formatBackendReleaseValidationReport,
  validateBackendReleaseEnvironment,
} = require('../release-environment.cjs');

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

function parseCommaSeparatedList(value) {
  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveConfiguredPath(filePath, fallbackPath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return fallbackPath;
  }

  return isAbsolute(filePath) ? filePath : resolve(projectDirectory, filePath);
}

loadEnvFile(backendEnvPath);

const defaultStoreFile = join(backendDirectory, 'data', 'store.json');
const defaultBackupDirectory = join(dirname(defaultStoreFile), 'backups');

export const BACKEND_DIRECTORIES = {
  projectDirectory,
  backendDirectory,
  sourceDirectory,
};

export const BACKEND_ENV_PATH = backendEnvPath;
export const APP_ENV = normalizeOptionalString(process.env.BACKEND_APP_ENV) || 'development';
export const HOST = process.env.BACKEND_HOST ?? process.env.HOST ?? '0.0.0.0';
export const PORT = parseNumber(process.env.BACKEND_PORT ?? process.env.PORT, 8081);
export const CORS_ORIGIN = process.env.BACKEND_CORS_ORIGIN ?? '*';
export const CORS_ORIGINS = parseCommaSeparatedList(CORS_ORIGIN);
export const CORS_ALLOW_ANY_ORIGIN = CORS_ORIGINS.includes('*');
export const STORE_FILE = resolveConfiguredPath(process.env.BACKEND_STORE_FILE, defaultStoreFile);
export const STORE_WRITE_MODE = 'atomic';
export const STORE_BACKUP_DIRECTORY = resolveConfiguredPath(
  process.env.BACKEND_STORE_BACKUP_DIRECTORY,
  defaultBackupDirectory,
);
export const STORE_BACKUP_ON_SAVE = parseBoolean(process.env.BACKEND_STORE_BACKUP_ON_SAVE, APP_ENV !== 'development');
export const STORE_BACKUP_RETENTION = Math.max(1, parseNumber(process.env.BACKEND_STORE_BACKUP_RETENTION, 10));
export const PUBLIC_BASE_URL = normalizeOptionalString(process.env.BACKEND_PUBLIC_BASE_URL) || '';
export const ADMIN_TOKEN = process.env.BACKEND_ADMIN_TOKEN ?? '';
export const SESSION_TTL_HOURS = Math.max(1, parseNumber(process.env.BACKEND_SESSION_TTL_HOURS, 24 * 7));
export const SESSION_TTL_MS = SESSION_TTL_HOURS * 60 * 60 * 1000;
export const MAX_BODY_SIZE_KB = Math.max(16, parseNumber(process.env.BACKEND_MAX_BODY_SIZE_KB, 256));
export const MAX_BODY_SIZE_BYTES = MAX_BODY_SIZE_KB * 1024;
export const ENABLE_ADMIN_STATUS = Boolean(ADMIN_TOKEN) && parseBoolean(process.env.BACKEND_ENABLE_ADMIN_STATUS, true);
export const ENABLE_RESET_ENDPOINT = Boolean(ADMIN_TOKEN) && parseBoolean(process.env.BACKEND_ENABLE_RESET_ENDPOINT, false);

const backendReleaseValidation = validateBackendReleaseEnvironment(process.env, {
  defaultStoreFile,
  defaultBackupDirectory,
  projectDirectory,
});

if (!backendReleaseValidation.ok && APP_ENV !== 'development') {
  throw new Error(formatBackendReleaseValidationReport(backendReleaseValidation));
}

if (backendReleaseValidation.warnings.length > 0 && APP_ENV !== 'development') {
  console.warn(formatBackendReleaseValidationReport(backendReleaseValidation));
}

export function getPublicBackendConfig() {
  return {
    appEnv: APP_ENV,
    host: HOST,
    port: PORT,
    corsOrigin: CORS_ORIGIN,
    corsOrigins: CORS_ORIGINS,
    allowAnyCorsOrigin: CORS_ALLOW_ANY_ORIGIN,
    storeFile: STORE_FILE,
    storeWriteMode: STORE_WRITE_MODE,
    storeBackupDirectory: STORE_BACKUP_DIRECTORY,
    storeBackupOnSave: STORE_BACKUP_ON_SAVE,
    storeBackupRetention: STORE_BACKUP_RETENTION,
    publicBaseUrl: PUBLIC_BASE_URL || undefined,
    sessionTtlHours: SESSION_TTL_HOURS,
    maxBodySizeKb: MAX_BODY_SIZE_KB,
    adminStatusEnabled: ENABLE_ADMIN_STATUS,
    resetEndpointEnabled: ENABLE_RESET_ENDPOINT,
    usingEnvFile: existsSync(BACKEND_ENV_PATH),
  };
}
