import { createDefaultConnectedSources } from '../repositories/authRepository.mjs';
import { buildUserRunMetrics } from '../points.mjs';
import { ApiError } from '../response/httpResponse.mjs';
import { isActiveRewardRedemption } from './adminNormalizers.mjs';
import {
  INITIAL_RANK,
  RANK_TIERS,
} from './rankSystem.mjs';

const metricsCacheByStore = new WeakMap();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function findUserById(store, userId) {
  const user = store.users.find((entry) => entry.id === userId);

  if (!user) {
    throw new ApiError(404, '사용자를 찾을 수 없어.');
  }

  return user;
}

export function getRunsForUser(store, userId) {
  return store.runs
    .filter((entry) => entry.userId === userId)
    .sort((left, right) => right.date.localeCompare(left.date));
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
    ...(typeof user.universityName === 'string' && user.universityName ? { universityName: user.universityName } : {}),
    ...(typeof user.addressDetail === 'string' && user.addressDetail ? { addressDetail: user.addressDetail } : {}),
    publicTag: user.publicTag,
    rankState: { ...ensureUserRankState(user) },
    lifetimeDistanceKm: metrics.lifetimeDistanceKm,
  };
}

function normalizeUserRankState(rankState) {
  if (
    !rankState
    || typeof rankState !== 'object'
    || Array.isArray(rankState)
    || !RANK_TIERS.includes(rankState.tier)
    || 'division' in rankState
    || !Number.isFinite(rankState.lp)
    || rankState.lp < 0
  ) {
    return null;
  }

  return {
    tier: rankState.tier,
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
