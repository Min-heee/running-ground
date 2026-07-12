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
// Save-triggered backups are debounced to at most one per interval; manual/explicit backups
// (backup-store script, restore/reset paths) bypass the debounce.
export const STORE_BACKUP_MIN_INTERVAL_MS = Math.max(0, parseNumber(process.env.BACKEND_STORE_BACKUP_MIN_INTERVAL_MS, 60_000));
export const PUBLIC_BASE_URL = normalizeOptionalString(process.env.BACKEND_PUBLIC_BASE_URL) || '';
export const ADMIN_TOKEN = process.env.BACKEND_ADMIN_TOKEN ?? '';
export const POSTGRES_DATABASE_URL = normalizeOptionalString(
  process.env.BACKEND_POSTGRES_DATABASE_URL ?? process.env.DATABASE_URL,
);
export const POSTGRES_SSL = parseBoolean(process.env.BACKEND_POSTGRES_SSL, APP_ENV !== 'development');
export const POSTGRES_POOL_MAX = Math.max(1, parseNumber(process.env.BACKEND_POSTGRES_POOL_MAX, 10));
export const POSTGRES_IDLE_TIMEOUT_MS = Math.max(1000, parseNumber(process.env.BACKEND_POSTGRES_IDLE_TIMEOUT_MS, 30000));
export const POSTGRES_CONNECTION_TIMEOUT_MS = Math.max(1000, parseNumber(process.env.BACKEND_POSTGRES_CONNECTION_TIMEOUT_MS, 10000));
export const POSTGRES_APPLICATION_NAME = normalizeOptionalString(process.env.BACKEND_POSTGRES_APPLICATION_NAME)
  || `runningground-backend-${APP_ENV}`;
export const POSTGRES_ENABLE_SESSION_READS = parseBoolean(process.env.BACKEND_POSTGRES_ENABLE_SESSION_READS, false);
export const POSTGRES_ENABLE_RUN_READS = parseBoolean(process.env.BACKEND_POSTGRES_ENABLE_RUN_READS, false);
export const POSTGRES_ENABLE_FRIEND_READS = parseBoolean(process.env.BACKEND_POSTGRES_ENABLE_FRIEND_READS, false);
export const POSTGRES_ENABLE_LEAGUE_READS = parseBoolean(process.env.BACKEND_POSTGRES_ENABLE_LEAGUE_READS, false);
export const SESSION_TTL_HOURS = Math.max(1, parseNumber(process.env.BACKEND_SESSION_TTL_HOURS, 24 * 7));
export const SESSION_TTL_MS = SESSION_TTL_HOURS * 60 * 60 * 1000;
export const PHONE_VERIFICATION_PROVIDER = normalizeOptionalString(process.env.BACKEND_PHONE_VERIFICATION_PROVIDER).toLowerCase()
  || (APP_ENV === 'development' ? 'mock' : 'solapi');
export const PHONE_VERIFICATION_CODE_TTL_MINUTES = Math.max(1, parseNumber(process.env.BACKEND_PHONE_VERIFICATION_CODE_TTL_MINUTES, 5));
export const PHONE_VERIFICATION_CODE_TTL_MS = PHONE_VERIFICATION_CODE_TTL_MINUTES * 60 * 1000;
export const PHONE_VERIFICATION_RESEND_COOLDOWN_SECONDS = Math.max(10, parseNumber(process.env.BACKEND_PHONE_VERIFICATION_RESEND_COOLDOWN_SECONDS, 60));
export const PHONE_VERIFICATION_RESEND_COOLDOWN_MS = PHONE_VERIFICATION_RESEND_COOLDOWN_SECONDS * 1000;
export const PHONE_VERIFICATION_MAX_ATTEMPTS = Math.max(1, parseNumber(process.env.BACKEND_PHONE_VERIFICATION_MAX_ATTEMPTS, 5));
export const PHONE_VERIFICATION_VERIFIED_TTL_MINUTES = Math.max(5, parseNumber(process.env.BACKEND_PHONE_VERIFICATION_VERIFIED_TTL_MINUTES, 30));
export const PHONE_VERIFICATION_VERIFIED_TTL_MS = PHONE_VERIFICATION_VERIFIED_TTL_MINUTES * 60 * 1000;
export const PHONE_VERIFICATION_EXPOSE_TEST_CODE = parseBoolean(process.env.BACKEND_PHONE_VERIFICATION_EXPOSE_TEST_CODE, APP_ENV === 'development');
export const SOLAPI_API_KEY = normalizeOptionalString(process.env.BACKEND_SOLAPI_API_KEY);
export const SOLAPI_API_SECRET = normalizeOptionalString(process.env.BACKEND_SOLAPI_API_SECRET);
export const SOLAPI_SENDER = normalizeOptionalString(process.env.BACKEND_SOLAPI_SENDER);
// Social login (Google/Naver/Kakao) OAuth credentials. The public client IDs also live in the
// app's EXPO_PUBLIC_* env; the secrets used for the server-side code exchange live only here.
export const GOOGLE_CLIENT_ID = normalizeOptionalString(process.env.BACKEND_GOOGLE_CLIENT_ID);
export const GOOGLE_CLIENT_SECRET = normalizeOptionalString(process.env.BACKEND_GOOGLE_CLIENT_SECRET);
export const KAKAO_REST_API_KEY = normalizeOptionalString(process.env.BACKEND_KAKAO_REST_API_KEY);
export const KAKAO_CLIENT_SECRET = normalizeOptionalString(process.env.BACKEND_KAKAO_CLIENT_SECRET);
export const NAVER_CLIENT_ID = normalizeOptionalString(process.env.BACKEND_NAVER_CLIENT_ID);
export const NAVER_CLIENT_SECRET = normalizeOptionalString(process.env.BACKEND_NAVER_CLIENT_SECRET);
export const MAX_BODY_SIZE_KB = Math.max(16, parseNumber(process.env.BACKEND_MAX_BODY_SIZE_KB, 1024));
export const MAX_BODY_SIZE_BYTES = MAX_BODY_SIZE_KB * 1024;
export const REQUEST_TIMEOUT_MS = Math.max(5000, parseNumber(process.env.BACKEND_REQUEST_TIMEOUT_MS, 30000));
export const HEADERS_TIMEOUT_MS = Math.min(REQUEST_TIMEOUT_MS, Math.max(5000, parseNumber(process.env.BACKEND_HEADERS_TIMEOUT_MS, 10000)));
export const KEEP_ALIVE_TIMEOUT_MS = Math.max(1000, parseNumber(process.env.BACKEND_KEEP_ALIVE_TIMEOUT_MS, 5000));
export const MAX_REQUESTS_PER_SOCKET = Math.max(1, parseNumber(process.env.BACKEND_MAX_REQUESTS_PER_SOCKET, 1000));
export const SHUTDOWN_TIMEOUT_MS = Math.max(1000, parseNumber(process.env.BACKEND_SHUTDOWN_TIMEOUT_MS, 10000));
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
    storeBackupMinIntervalMs: STORE_BACKUP_MIN_INTERVAL_MS,
    publicBaseUrl: PUBLIC_BASE_URL || undefined,
    postgres: {
      configured: Boolean(POSTGRES_DATABASE_URL),
      ssl: POSTGRES_SSL,
      poolMax: POSTGRES_POOL_MAX,
      idleTimeoutMs: POSTGRES_IDLE_TIMEOUT_MS,
      connectionTimeoutMs: POSTGRES_CONNECTION_TIMEOUT_MS,
      applicationName: POSTGRES_APPLICATION_NAME,
      enableSessionReads: POSTGRES_ENABLE_SESSION_READS,
      enableRunReads: POSTGRES_ENABLE_RUN_READS,
      enableFriendReads: POSTGRES_ENABLE_FRIEND_READS,
      enableLeagueReads: POSTGRES_ENABLE_LEAGUE_READS,
    },
    sessionTtlHours: SESSION_TTL_HOURS,
    phoneVerification: {
      provider: PHONE_VERIFICATION_PROVIDER,
      codeTtlMinutes: PHONE_VERIFICATION_CODE_TTL_MINUTES,
      resendCooldownSeconds: PHONE_VERIFICATION_RESEND_COOLDOWN_SECONDS,
      maxAttempts: PHONE_VERIFICATION_MAX_ATTEMPTS,
      verifiedTtlMinutes: PHONE_VERIFICATION_VERIFIED_TTL_MINUTES,
      exposeTestCode: PHONE_VERIFICATION_EXPOSE_TEST_CODE,
      solapiConfigured: Boolean(SOLAPI_API_KEY && SOLAPI_API_SECRET && SOLAPI_SENDER),
    },
    maxBodySizeKb: MAX_BODY_SIZE_KB,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    headersTimeoutMs: HEADERS_TIMEOUT_MS,
    keepAliveTimeoutMs: KEEP_ALIVE_TIMEOUT_MS,
    maxRequestsPerSocket: MAX_REQUESTS_PER_SOCKET,
    shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS,
    adminStatusEnabled: ENABLE_ADMIN_STATUS,
    resetEndpointEnabled: ENABLE_RESET_ENDPOINT,
    usingEnvFile: existsSync(BACKEND_ENV_PATH),
  };
}

// ---------------------------------------------------------------------------
// Rate limiting (SMS 발송 + 로그인 남용 방지) — src/lib/rateLimiter.mjs에서 사용.
// ---------------------------------------------------------------------------
// X-Forwarded-For를 믿을지 여부. 리버스 프록시가 신뢰할 수 없는 클라이언트의 XFF를
// 지우거나 덮어쓰도록 구성된 배포에서만 true로 켠다. 기본은 소켓 remoteAddress 사용.
export const TRUST_PROXY = parseBoolean(process.env.BACKEND_TRUST_PROXY, false);
// SMS request-code 계층 한도 (전부 고정 윈도우). per-IP 한도는 한국 통신사 CGNAT(한 IP 뒤에
// 수백~수천 명)를 감안해 느슨하게 — 진짜 과금 방어선은 per-phone/일 + 전역/일 한도다.
export const SMS_PER_IP_PER_HOUR = Math.max(1, parseNumber(process.env.BACKEND_SMS_PER_IP_PER_HOUR, 30));
export const SMS_UNIQUE_PHONES_PER_IP_PER_DAY = Math.max(1, parseNumber(process.env.BACKEND_SMS_UNIQUE_PHONES_PER_IP_PER_DAY, 20));
export const SMS_PER_PHONE_PER_DAY = Math.max(1, parseNumber(process.env.BACKEND_SMS_PER_PHONE_PER_DAY, 10));
export const SMS_GLOBAL_PER_DAY = Math.max(1, parseNumber(process.env.BACKEND_SMS_GLOBAL_PER_DAY, 1000));
// 로그인 한도. per-IP는 CGNAT 공유를 감안해 느슨하게; 브루트포스 방어는 per-account가 담당.
export const LOGIN_PER_IP_PER_MINUTE = Math.max(1, parseNumber(process.env.BACKEND_LOGIN_PER_IP_PER_MINUTE, 60));
export const LOGIN_PER_ACCOUNT_PER_HOUR = Math.max(1, parseNumber(process.env.BACKEND_LOGIN_PER_ACCOUNT_PER_HOUR, 20));

// App-Review 로그인 우회 계정: 앱 심사관은 한국 SMS를 못 받으므로, 지정된 심사용 번호는 실제
// SMS 발송 없이 고정 6자리 OTP로 인증한다. 두 값이 모두 설정되고 OTP가 6자리 숫자일 때만
// 활성화 — 기본은 완전히 꺼져 있어 우회 경로 자체가 존재하지 않는다. 이 번호는 심사 전용
// 1회용 계정으로만 쓰고 실제 유저 번호를 넣지 말 것 (번호+OTP 조합을 아는 사람은 그 계정에
// 로그인할 수 있다).
const rawReviewLoginOtp = String(process.env.BACKEND_REVIEW_LOGIN_OTP ?? '').trim();
export const REVIEW_LOGIN_PHONE = String(process.env.BACKEND_REVIEW_LOGIN_PHONE ?? '').replace(/[^\d]/g, '');
export const REVIEW_LOGIN_OTP = /^\d{6}$/.test(rawReviewLoginOtp) ? rawReviewLoginOtp : '';

// ---------------------------------------------------------------------------
// Match integrity — testMode 게이트 + vanished-match tombstone.
// ---------------------------------------------------------------------------
// 클라이언트가 보낸 testMode:true(가짜 상대 매치)를 존중할지 여부. production에서는
// 기본 차단. 차단 시 400을 내지 않고 조용히 false로 무시한다 — 옛 클라이언트가
// 아직 필드를 보낼 수 있기 때문.
export const ALLOW_TEST_MATCHES = parseBoolean(process.env.BACKEND_ALLOW_TEST_MATCHES, APP_ENV !== 'production');
// prune/삭제로 사라진 매치 ID를 기억하는 in-memory tombstone TTL —
// src/lib/vanishedMatchTombstones.mjs에서 사용. 재시작하면 비워지고 404로 폴백한다.
export const VANISHED_MATCH_TOMBSTONE_TTL_MS = Math.max(
  1000,
  parseNumber(process.env.BACKEND_VANISHED_MATCH_TOMBSTONE_TTL_MS, 6 * 60 * 60 * 1000),
);
