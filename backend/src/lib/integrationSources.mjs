import { getPendingImportCount } from '../repositories/runsRepository.mjs';
import { ApiError } from '../response/httpResponse.mjs';
import { ensureUserConnectedSources } from './userStoreHelpers.mjs';

export const SOURCE_LABEL_BY_TYPE = {
  apple_health: 'Apple Health',
  health_connect: 'Health Connect',
  garmin: 'Garmin',
  strava: 'Strava',
  nrc: 'Nike Run Club',
  mynb: 'MyNB',
  runningground: 'RunningGround',
  manual: 'Manual',
};
const EXCLUSIVE_INTEGRATION_SOURCE_TYPES = new Set(['apple_health', 'health_connect', 'garmin', 'strava', 'nrc', 'mynb']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function isExclusiveIntegrationSourceType(sourceType) {
  return EXCLUSIVE_INTEGRATION_SOURCE_TYPES.has(sourceType);
}

export function decorateIntegrationSource(store, user, source) {
  const pendingImportCount = getPendingImportCount(store, user.id, source.sourceType);
  return {
    ...clone(source),
    displayName: SOURCE_LABEL_BY_TYPE[source.sourceType] ?? source.displayName ?? source.sourceType,
    ...(pendingImportCount > 0 ? { pendingImportCount } : {}),
  };
}

export function buildIntegrationSources(store, user) {
  return ensureUserConnectedSources(user).map((source) => decorateIntegrationSource(store, user, source));
}

export function buildIntegrationSourceActionResult(store, user, source) {
  return {
    success: true,
    source: decorateIntegrationSource(store, user, source),
    sources: buildIntegrationSources(store, user),
  };
}

export function requireConnectedSource(user, sourceType) {
  const source = ensureUserConnectedSources(user).find((entry) => entry.sourceType === sourceType);

  if (!source) {
    throw new ApiError(404, '선택한 연동 소스를 찾을 수 없어요.');
  }

  return source;
}
