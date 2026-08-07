import { createDefaultConnectedSources } from '../repositories/authRepository.mjs';
import { buildUserRunMetrics, getAvailableRewardPoints } from './points.mjs';
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

// 그라운드(runmadang) 참가 포인트 순지출 = 걸려 있는(또는 잃은) 스테이크 − 받은 상금. 원장 행은 절대
// 삭제되지 않고 환불은 status='refunded'로만 표시된다 (runmadang.mjs). 상금이 참가 포인트보다
// 크면 음수가 되어 밸런스를 늘린다 — getAvailableRewardPoints의 max(0,...)와 합쳐져
// 안전하다. 여기(단일 차감 합산 지점)에 넣어야 마켓 결제·프로필·마켓 개요가 전부
// 같은 밸런스를 본다.
function getRunmadangNetSpentPoints(store, userId) {
  const staked = (store.runmadangStakes ?? [])
    .filter((entry) => entry.userId === userId && entry.status === 'staked')
    .reduce((sum, entry) => sum + (Number(entry.points) || 0), 0);
  const awarded = (store.runmadangAwards ?? [])
    .filter((entry) => entry.userId === userId)
    .reduce((sum, entry) => sum + (Number(entry.points) || 0), 0);

  return staked - awarded;
}

export function getRedeemedPointCost(store, userId) {
  const catalogByItemId = new Map((store.marketCatalog ?? []).map((item) => [item.id, item.costPoints]));

  const redeemed = (store.rewardRedemptions ?? [])
    .filter((entry) => entry.userId === userId && isActiveRewardRedemption(entry))
    .reduce((sum, entry) => {
      const storedCostPoints = typeof entry.costPoints === 'number' ? entry.costPoints : null;
      return sum + (storedCostPoints ?? catalogByItemId.get(entry.itemId) ?? 0);
    }, 0);

  return redeemed + getRunmadangNetSpentPoints(store, userId);
}

export function buildProfile(store, user) {
  ensureUserConnectedSources(user);
  ensureUserRankState(user);
  const metrics = getUserMetrics(store, user.id);

  return buildProfileWithMetrics(user, metrics, {
    availablePoints: getAvailableRewardPoints(metrics, getRedeemedPointCost(store, user.id)),
  });
}

export function buildProfileWithMetrics(user, metrics, { availablePoints } = {}) {
  return {
    // 불변 식별자 (적대 리뷰 2026-08-06): 클라 저장 대기열의 소유자 대조는 개명 가능한
    // publicTag 대신 이 id를 쓴다.
    id: user.id,
    name: user.name,
    ...(typeof user.provinceName === 'string' && user.provinceName ? { provinceName: user.provinceName } : {}),
    ...(typeof user.cityName === 'string' && user.cityName ? { cityName: user.cityName } : {}),
    districtName: user.districtName,
    ...(typeof user.addressDetail === 'string' && user.addressDetail ? { addressDetail: user.addressDetail } : {}),
    publicTag: user.publicTag,
    ...(typeof user.statusMessage === 'string' && user.statusMessage ? { statusMessage: user.statusMessage } : {}),
    rankState: { ...ensureUserRankState(user) },
    lifetimeDistanceKm: metrics.lifetimeDistanceKm,
    // 마이탭 포인트 카드 (오너 2026-08-02: "포인트를 주는데 어디에도 안 보인다").
    // availablePoints는 마켓 currentPoints와 같은 기준(적립 − 사용) — 호출자가 store를
    // 들고 있을 때만 계산해서 넘긴다.
    totalPoints: metrics.totalEarnedPoints ?? 0,
    currentMonthPoints: metrics.currentMonthPoints ?? 0,
    ...(typeof availablePoints === 'number' ? { availablePoints } : {}),
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
