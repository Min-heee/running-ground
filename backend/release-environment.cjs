const { isAbsolute, relative } = require('node:path');

const APP_ENVS = ['development', 'preview', 'production'];

function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeAppEnv(value) {
  return APP_ENVS.includes(value) ? value : 'development';
}

function parseBoolean(value, fallbackValue = false) {
  const normalized = normalizeOptionalString(value).toLowerCase();

  if (!normalized) {
    return fallbackValue;
  }

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallbackValue;
}

function parseNumber(value, fallbackValue) {
  const parsed = Number(normalizeOptionalString(value));
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function isLocalHostname(hostname) {
  const normalized = hostname.toLowerCase();

  if (
    normalized === 'localhost'
    || normalized === '0.0.0.0'
    || normalized === '127.0.0.1'
    || normalized === '10.0.2.2'
    || normalized.endsWith('.local')
  ) {
    return true;
  }

  if (/^10\.\d+\.\d+\.\d+$/.test(normalized)) {
    return true;
  }

  if (/^192\.168\.\d+\.\d+$/.test(normalized)) {
    return true;
  }

  if (/^169\.254\.\d+\.\d+$/.test(normalized)) {
    return true;
  }

  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(normalized)) {
    return true;
  }

  return false;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidHostname(value) {
  return /^(?=.{1,253}$)(?!-)(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,63}$/.test(value);
}

function buildResolvedBackendEnvironment(env, options = {}) {
  const appEnv = normalizeAppEnv(env.BACKEND_APP_ENV);
  const adminToken = normalizeOptionalString(env.BACKEND_ADMIN_TOKEN);
  const enableAdminStatus = Boolean(adminToken) && parseBoolean(env.BACKEND_ENABLE_ADMIN_STATUS, true);
  const enableResetEndpoint = Boolean(adminToken) && parseBoolean(env.BACKEND_ENABLE_RESET_ENDPOINT, false);
  const storeFile = normalizeOptionalString(env.BACKEND_STORE_FILE) || normalizeOptionalString(options.defaultStoreFile);
  const backupDirectory = normalizeOptionalString(env.BACKEND_STORE_BACKUP_DIRECTORY) || normalizeOptionalString(options.defaultBackupDirectory);

  return {
    appEnv,
    host: normalizeOptionalString(env.BACKEND_HOST) || normalizeOptionalString(env.HOST) || '0.0.0.0',
    port: parseNumber(env.BACKEND_PORT ?? env.PORT, 8081),
    publicBaseUrl: normalizeOptionalString(env.BACKEND_PUBLIC_BASE_URL),
    corsOrigin: normalizeOptionalString(env.BACKEND_CORS_ORIGIN) || '*',
    adminToken,
    enableAdminStatus,
    enableResetEndpoint,
    sessionTtlHours: Math.max(1, parseNumber(env.BACKEND_SESSION_TTL_HOURS, 24 * 7)),
    maxBodySizeKb: Math.max(16, parseNumber(env.BACKEND_MAX_BODY_SIZE_KB, 256)),
    storeFile,
    backupDirectory,
    backupOnSave: parseBoolean(env.BACKEND_STORE_BACKUP_ON_SAVE, appEnv !== 'development'),
    backupRetention: Math.max(1, parseNumber(env.BACKEND_STORE_BACKUP_RETENTION, 10)),
    publicDomain: normalizeOptionalString(env.PUBLIC_DOMAIN),
    acmeEmail: normalizeOptionalString(env.ACME_EMAIL),
  };
}

function validateBackendReleaseEnvironment(env, options = {}) {
  const resolved = buildResolvedBackendEnvironment(env, options);
  const errors = [];
  const warnings = [];
  let parsedPublicBaseUrl = null;

  if (resolved.publicBaseUrl) {
    try {
      parsedPublicBaseUrl = new URL(resolved.publicBaseUrl);
    } catch {
      errors.push('BACKEND_PUBLIC_BASE_URL 이 올바른 URL 형식이 아니야.');
    }
  }

  if (resolved.appEnv !== 'development') {
    if (!resolved.publicBaseUrl) {
      errors.push(`${resolved.appEnv} 환경에는 BACKEND_PUBLIC_BASE_URL 이 꼭 필요해.`);
    }

    if (parsedPublicBaseUrl && parsedPublicBaseUrl.protocol !== 'https:') {
      errors.push(`${resolved.appEnv} 환경의 BACKEND_PUBLIC_BASE_URL 은 HTTPS 여야 해.`);
    }

    if (parsedPublicBaseUrl && isLocalHostname(parsedPublicBaseUrl.hostname)) {
      errors.push(`${resolved.appEnv} 환경의 BACKEND_PUBLIC_BASE_URL 은 localhost, emulator host, 사설 IP를 쓰면 안 돼.`);
    }

    if (resolved.enableResetEndpoint) {
      errors.push(`${resolved.appEnv} 환경에서는 BACKEND_ENABLE_RESET_ENDPOINT 를 켜면 안 돼.`);
    }

    if (!resolved.backupOnSave) {
      errors.push(`${resolved.appEnv} 환경에서는 BACKEND_STORE_BACKUP_ON_SAVE 를 true 로 두는 편이 안전해.`);
    }

    if (resolved.corsOrigin === '*') {
      warnings.push(`${resolved.appEnv} 환경에서도 모바일 앱은 동작하지만, BACKEND_CORS_ORIGIN=* 는 운영 보안 관점에서 다시 검토하는 게 좋아.`);
    }

    if (!resolved.adminToken) {
      warnings.push(`${resolved.appEnv} 환경에는 BACKEND_ADMIN_TOKEN 을 넣고 admin 상태 점검만 열어두는 편이 운영에 도움이 돼.`);
    }

    if (resolved.sessionTtlHours > 24 * 30) {
      warnings.push('BACKEND_SESSION_TTL_HOURS 가 30일보다 길어. 운영 세션 정책을 다시 확인해봐.');
    }

    if (resolved.backupRetention < 5) {
      warnings.push('BACKEND_STORE_BACKUP_RETENTION 이 5보다 작아. 운영용이면 보관 개수를 조금 더 두는 편이 안전해.');
    }
  }

  if (resolved.host && resolved.host !== '0.0.0.0' && resolved.appEnv !== 'development') {
    warnings.push(`${resolved.appEnv} 환경에서는 BACKEND_HOST 를 0.0.0.0 으로 두는 편이 일반적이야.`);
  }

  if (parsedPublicBaseUrl && (parsedPublicBaseUrl.search || parsedPublicBaseUrl.hash)) {
    warnings.push('BACKEND_PUBLIC_BASE_URL 에 query 또는 hash 를 넣지 않는 편이 안전해.');
  }

  if (resolved.storeFile && !isAbsolute(resolved.storeFile) && resolved.appEnv !== 'development') {
    warnings.push('운영용 BACKEND_STORE_FILE 은 절대 경로나 명확한 볼륨 경로를 쓰는 편이 안전해.');
  }

  if (resolved.backupDirectory && !isAbsolute(resolved.backupDirectory) && resolved.appEnv !== 'development') {
    warnings.push('운영용 BACKEND_STORE_BACKUP_DIRECTORY 는 절대 경로나 명확한 볼륨 경로를 쓰는 편이 안전해.');
  }

  if (
    resolved.storeFile
    && options.projectDirectory
    && !relative(options.projectDirectory, resolved.storeFile).startsWith('..')
    && resolved.appEnv === 'production'
  ) {
    warnings.push('production 저장소 파일이 아직 프로젝트 디렉터리 안에 있어. 서버 볼륨이나 별도 디스크 경로가 더 안전해.');
  }

  if (resolved.publicDomain || resolved.acmeEmail) {
    if (!resolved.publicDomain || !isValidHostname(resolved.publicDomain)) {
      errors.push('PUBLIC_DOMAIN 이 비어 있거나 올바른 도메인 형식이 아니야.');
    }

    if (!resolved.acmeEmail || !isValidEmail(resolved.acmeEmail)) {
      errors.push('ACME_EMAIL 이 비어 있거나 올바른 이메일 형식이 아니야.');
    }

    if (
      parsedPublicBaseUrl
      && resolved.publicDomain
      && parsedPublicBaseUrl.hostname !== resolved.publicDomain
    ) {
      errors.push('PUBLIC_DOMAIN 과 BACKEND_PUBLIC_BASE_URL 호스트가 서로 달라.');
    }
  }

  return {
    ok: errors.length === 0,
    resolved,
    errors,
    warnings,
  };
}

function formatBackendReleaseValidationReport(result) {
  const lines = [
    `[backend-release-check] env: ${result.resolved.appEnv}`,
    `[backend-release-check] public base url: ${result.resolved.publicBaseUrl || '(not set)'}`,
    `[backend-release-check] cors origin: ${result.resolved.corsOrigin || '(not set)'}`,
    `[backend-release-check] store file: ${result.resolved.storeFile || '(not set)'}`,
    `[backend-release-check] backup on save: ${result.resolved.backupOnSave ? 'true' : 'false'}`,
    `[backend-release-check] backup retention: ${result.resolved.backupRetention}`,
  ];

  if (result.errors.length > 0) {
    lines.push('[backend-release-check] errors:');
    result.errors.forEach((error) => {
      lines.push(`- ${error}`);
    });
  }

  if (result.warnings.length > 0) {
    lines.push('[backend-release-check] warnings:');
    result.warnings.forEach((warning) => {
      lines.push(`- ${warning}`);
    });
  }

  if (result.ok) {
    lines.push('[backend-release-check] ready');
  }

  return lines.join('\n');
}

module.exports = {
  buildResolvedBackendEnvironment,
  formatBackendReleaseValidationReport,
  normalizeAppEnv,
  validateBackendReleaseEnvironment,
};
