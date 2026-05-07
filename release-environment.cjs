const { URL } = require('node:url');

const DEFAULT_EAS_PROJECT_ID = 'd57b0e4f-f084-4000-8ec7-188ee2561c52';
const APP_VARIANTS = ['development', 'preview', 'production'];

function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeAppVariant(value) {
  return APP_VARIANTS.includes(value) ? value : 'development';
}

function readBooleanEnv(value, fallbackValue) {
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

function readPositiveInteger(value, fallbackValue) {
  const parsed = Number.parseInt(normalizeOptionalString(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidIosBundleIdentifier(value) {
  return /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(value);
}

function isValidAndroidPackage(value) {
  return /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(value);
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

function isTailnetHostname(hostname) {
  return hostname.toLowerCase().endsWith('.ts.net');
}

function parseApiBaseUrl(value) {
  const normalized = normalizeOptionalString(value);

  if (!normalized) {
    return null;
  }

  return new URL(normalized);
}

function buildResolvedReleaseEnvironment(env, options = {}) {
  const appVariant = normalizeAppVariant(env.APP_VARIANT);

  return {
    appVariant,
    useMockApi: readBooleanEnv(env.EXPO_PUBLIC_USE_MOCK_API, false),
    apiBaseUrl: normalizeOptionalString(env.EXPO_PUBLIC_API_BASE_URL),
    apiTimeoutMs: readPositiveInteger(env.EXPO_PUBLIC_API_TIMEOUT_MS, 10000),
    easProjectId: normalizeOptionalString(env.EAS_PROJECT_ID) || normalizeOptionalString(options.defaultEasProjectId) || '',
    iosBundleId: normalizeOptionalString(env.IOS_BUNDLE_ID) || normalizeOptionalString(options.defaultIosBundleId) || '',
    androidPackage: normalizeOptionalString(env.ANDROID_PACKAGE) || normalizeOptionalString(options.defaultAndroidPackage) || '',
    iosBuildNumber: normalizeOptionalString(env.IOS_BUILD_NUMBER) || '1',
    androidVersionCode: readPositiveInteger(env.ANDROID_VERSION_CODE, 1),
  };
}

function validateReleaseEnvironment(env, options = {}) {
  const resolved = buildResolvedReleaseEnvironment(env, options);
  const errors = [];
  const warnings = [];

  let parsedApiUrl = null;

  if (resolved.apiBaseUrl) {
    try {
      parsedApiUrl = parseApiBaseUrl(resolved.apiBaseUrl);
    } catch {
      errors.push('EXPO_PUBLIC_API_BASE_URL 이 올바른 URL 형식이 아니야.');
    }
  }

  if (parsedApiUrl && !['http:', 'https:'].includes(parsedApiUrl.protocol)) {
    errors.push('EXPO_PUBLIC_API_BASE_URL 은 http 또는 https URL 이어야 해.');
  }

  if (parsedApiUrl && !parsedApiUrl.pathname.endsWith('/api')) {
    warnings.push('EXPO_PUBLIC_API_BASE_URL 경로가 `/api` 로 끝나지 않아. 현재 클라이언트 기준으로는 `/api` 엔드포인트를 권장해.');
  }

  if (parsedApiUrl && (parsedApiUrl.search || parsedApiUrl.hash)) {
    warnings.push('EXPO_PUBLIC_API_BASE_URL 에 query 나 hash 를 넣지 않는 편이 안전해.');
  }

  if (resolved.appVariant !== 'development') {
    if (resolved.useMockApi) {
      errors.push(`${resolved.appVariant} 빌드에서는 EXPO_PUBLIC_USE_MOCK_API 를 false 로 둬야 해.`);
    }

    if (!resolved.apiBaseUrl) {
      errors.push(`${resolved.appVariant} 빌드에는 EXPO_PUBLIC_API_BASE_URL 이 꼭 필요해.`);
    }

    if (parsedApiUrl && parsedApiUrl.protocol !== 'https:') {
      errors.push(`${resolved.appVariant} 빌드의 EXPO_PUBLIC_API_BASE_URL 은 HTTPS 여야 해.`);
    }

    if (parsedApiUrl && isLocalHostname(parsedApiUrl.hostname)) {
      errors.push(`${resolved.appVariant} 빌드의 EXPO_PUBLIC_API_BASE_URL 은 localhost, emulator host, 사설 IP를 쓰면 안 돼.`);
    }

    if (parsedApiUrl && resolved.appVariant === 'production' && isTailnetHostname(parsedApiUrl.hostname)) {
      errors.push('production 빌드의 EXPO_PUBLIC_API_BASE_URL 은 Tailnet 내부 주소(.ts.net)가 아니라 공개 API 도메인을 써야 해.');
    }

    if (!resolved.easProjectId || !isUuid(resolved.easProjectId)) {
      errors.push(`${resolved.appVariant} 빌드에는 올바른 EAS_PROJECT_ID 가 필요해.`);
    }

    if (!resolved.iosBundleId || !isValidIosBundleIdentifier(resolved.iosBundleId)) {
      errors.push(`${resolved.appVariant} 빌드에는 올바른 IOS_BUNDLE_ID 가 필요해.`);
    }

    if (!resolved.androidPackage || !isValidAndroidPackage(resolved.androidPackage)) {
      errors.push(`${resolved.appVariant} 빌드에는 올바른 ANDROID_PACKAGE 가 필요해.`);
    }

    if (resolved.iosBundleId.includes('anonymous') || resolved.androidPackage.includes('anonymous')) {
      errors.push(`${resolved.appVariant} 빌드에서는 anonymous 기본 식별자를 그대로 쓰면 안 돼.`);
    }
  }

  if (resolved.useMockApi && resolved.apiBaseUrl) {
    warnings.push('USE_MOCK_API 가 true 면 EXPO_PUBLIC_API_BASE_URL 값은 실제로 쓰이지 않아.');
  }

  if (!/^\d+$/.test(resolved.iosBuildNumber)) {
    warnings.push('IOS_BUILD_NUMBER 는 숫자 문자열 형식이 가장 안전해.');
  }

  return {
    ok: errors.length === 0,
    resolved,
    errors,
    warnings,
  };
}

function formatReleaseValidationReport(result) {
  const lines = [
    `[release-check] variant: ${result.resolved.appVariant}`,
    `[release-check] api base url: ${result.resolved.apiBaseUrl || '(not set)'}`,
    `[release-check] mock api: ${result.resolved.useMockApi ? 'true' : 'false'}`,
    `[release-check] ios bundle id: ${result.resolved.iosBundleId || '(not set)'}`,
    `[release-check] android package: ${result.resolved.androidPackage || '(not set)'}`,
    `[release-check] eas project id: ${result.resolved.easProjectId || '(not set)'}`,
  ];

  if (result.errors.length > 0) {
    lines.push('[release-check] errors:');
    result.errors.forEach((error) => {
      lines.push(`- ${error}`);
    });
  }

  if (result.warnings.length > 0) {
    lines.push('[release-check] warnings:');
    result.warnings.forEach((warning) => {
      lines.push(`- ${warning}`);
    });
  }

  if (result.ok) {
    lines.push('[release-check] ready');
  }

  return lines.join('\n');
}

module.exports = {
  DEFAULT_EAS_PROJECT_ID,
  buildResolvedReleaseEnvironment,
  formatReleaseValidationReport,
  normalizeAppVariant,
  validateReleaseEnvironment,
};
