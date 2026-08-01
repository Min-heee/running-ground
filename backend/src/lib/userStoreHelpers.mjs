import { createDefaultConnectedSources } from '../repositories/authRepository.mjs';
import { buildUserRunMetrics } from './points.mjs';
import { ApiError } from '../response/httpResponse.mjs';
import { isActiveRewardRedemption } from './adminNormalizers.mjs';
import {
  INITIAL_RANK,
  RANK_TIERS,
  resolveRankTier,
} from './rankSystem.mjs';

const metricsCacheByStore = new WeakMap();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function findUserById(store, userId) {
  const user = store.users.find((entry) => entry.id === userId);

  if (!user) {
    throw new ApiError(404, '사용자를 찾을 수 없어요.');
  }

  return user;
}

// 최근 기록이 먼저 오는 정렬. date는 일 단위 문자열이라 같은 날 두 번 달리면 순서를 못
// 가른다 (오너 2026-08-02: 같은 날 10km/5km가 뒤집혀 보임) — 같은 날짜는 startedAt
// (시각)으로 가르고, 시각 없는 기록(수동 추가)은 그 날짜 안에서 뒤로 보낸다.
// postgres 쿼리들의 `run_date desc, created_at desc`와 같은 의미의 json 저장소 판.
export function compareRunsLatestFirst(left, right) {
  const dateOrder = String(right?.date ?? '').localeCompare(String(left?.date ?? ''));

  if (dateOrder !== 0) {
    return dateOrder;
  }

  const leftStartedMs = Date.parse(left?.startedAt ?? '');
  const rightStartedMs = Date.parse(right?.startedAt ?? '');
  const leftHasTime = Number.isFinite(leftStartedMs);
  const rightHasTime = Number.isFinite(rightStartedMs);

  if (leftHasTime && rightHasTime) {
    return rightStartedMs - leftStartedMs;
  }

  if (leftHasTime !== rightHasTime) {
    return leftHasTime ? -1 : 1;
  }

  return 0;
}

export function getRunsForUser(store, userId) {
  return store.runs
    .filter((entry) => entry.userId === userId)
    .sort(compareRunsLatestFirst);
}

export function getTotalDistance(runs) {
  return Number(runs.reduce((sum, run) => sum + run.distanceKm, 0).toFixed(1));
}

export function getUserMetrics(store, userId) {
  let metricsByUserId = metricsCacheByStore.get(store);

  if (!metricsByUserId) {
    metricsByUserId = new Map();
    metricsCacheByStore.set(store, metricsByUserId);
  }

  if (!metricsByUserId.has(userId)) {
    metricsByUserId.set(userId, buildUserRunMetrics(getRunsForUser(store, userId)));
  }

  return metricsByUserId.get(userId);
}

// Drop a user's memoized metrics for this store object so the NEXT getUserMetrics recomputes
// from the current store.runs. The cache is computed lazily and never invalidated within a
// request, which is fine when metrics are read once at the end. But a save path that reads
// metrics-dependent data BEFORE pushing the new run (e.g. the server-authoritative duel verdict
// resolver, which reads the opponent's runner profile → metrics) would otherwise poison the
// cache with pre-push metrics and miss the just-saved run's match bonus. Callers that mutate
// store.runs after such a read must invalidate before recomputing.
export function invalidateUserMetrics(store, userId) {
  metricsCacheByStore.get(store)?.delete(userId);
}

export function getRedeemedPointCost(store, userId) {
  const catalogByItemId = new Map((store.marketCatalog ?? []).map((item) => [item.id, item.costPoints]));

  return (store.rewardRedemptions ?? [])
    .filter((entry) => entry.userId === userId && isActiveRewardRedemption(entry))
    .reduce((sum, entry) => {
      const storedCostPoints = typeof entry.costPoints === 'number' ? entry.costPoints : null;
      return sum + (storedCostPoints ?? catalogByItemId.get(entry.itemId) ?? 0);
    }, 0);
}

export function buildProfile(store, user) {
  ensureUserConnectedSources(user);
  ensureUserRankState(user);
  return buildProfileWithMetrics(user, getUserMetrics(store, user.id));
}

export function buildProfileWithMetrics(user, metrics) {
  return {
    name: user.name,
    ...(typeof user.provinceName === 'string' && user.provinceName ? { provinceName: user.provinceName } : {}),
    ...(typeof user.cityName === 'string' && user.cityName ? { cityName: user.cityName } : {}),
    districtName: user.districtName,
    ...(typeof user.addressDetail === 'string' && user.addressDetail ? { addressDetail: user.addressDetail } : {}),
    publicTag: user.publicTag,
    ...(typeof user.statusMessage === 'string' && user.statusMessage ? { statusMessage: user.statusMessage } : {}),
    rankState: { ...ensureUserRankState(user) },
    lifetimeDistanceKm: metrics.lifetimeDistanceKm,
  };
}

function normalizeUserRankState(rankState) {
  const tier = resolveRankTier(rankState?.tier);

  if (
    !rankState
    || typeof rankState !== 'object'
    || Array.isArray(rankState)
    || !RANK_TIERS.includes(tier)
    || 'division' in rankState
    || !Number.isFinite(rankState.lp)
    || rankState.lp < 0
  ) {
    return null;
  }

  return {
    tier,
    lp: Math.trunc(rankState.lp),
  };
}

export function ensureUserRankState(user) {
  const normalizedRankState = normalizeUserRankState(user.rankState);

  if (!normalizedRankState) {
    user.rankState = { ...INITIAL_RANK };
  } else if (
    user.rankState.tier !== normalizedRankState.tier
    || user.rankState.lp !== normalizedRankState.lp
    || Object.keys(user.rankState).some((key) => key !== 'tier' && key !== 'lp')
  ) {
    user.rankState = normalizedRankState;
  }

  return user.rankState;
}

export function ensureUserConnectedSources(user) {
  const defaultSources = createDefaultConnectedSources();
  const currentSources = Array.isArray(user.connectedSources) ? user.connectedSources : [];
  const currentSourceByType = new Map(
    currentSources
      .filter((entry) => entry && typeof entry === 'object' && typeof entry.sourceType === 'string')
      .map((entry) => [entry.sourceType, entry]),
  );
  const knownSourceTypes = new Set(defaultSources.map((source) => source.sourceType));
  const mergedDefaultSources = defaultSources.map((defaultSource) => {
    const existingSource = currentSourceByType.get(defaultSource.sourceType);

    if (!existingSource) {
      return clone(defaultSource);
    }

    return {
      ...clone(defaultSource),
      ...clone(existingSource),
      sourceType: defaultSource.sourceType,
      displayName: existingSource.displayName ?? defaultSource.displayName,
      recommendedPlatform: existingSource.recommendedPlatform ?? defaultSource.recommendedPlatform,
    };
  });
  const extraSources = currentSources
    .filter((source) => !knownSourceTypes.has(source?.sourceType))
    .map((source) => clone(source));

  user.connectedSources = [...mergedDefaultSources, ...extraSources];
  return user.connectedSources;
}
