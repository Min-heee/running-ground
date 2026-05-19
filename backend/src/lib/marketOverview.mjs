import { getAvailableRewardPoints } from '../points.mjs';
import { isActiveRewardRedemption, normalizeOptionalString, normalizeRewardRedemptionStatus } from './adminNormalizers.mjs';
import { getRedeemedPointCost, getUserMetrics } from './userStoreHelpers.mjs';

export function ensureMarketCatalogStore(store) {
  if (!Array.isArray(store.marketCatalog)) {
    store.marketCatalog = [];
  }

  for (const item of store.marketCatalog) {
    if (typeof item.isActive !== 'boolean') {
      item.isActive = true;
    }

    if (!Object.prototype.hasOwnProperty.call(item, 'inventoryCount')) {
      item.inventoryCount = null;
    }
  }
}

export function buildRedemptionCountByItemId(store) {
  return (store.rewardRedemptions ?? []).reduce((map, entry) => {
    if (!isActiveRewardRedemption(entry)) {
      return map;
    }

    map.set(entry.itemId, (map.get(entry.itemId) ?? 0) + 1);
    return map;
  }, new Map());
}

export function getMarketItemRemainingStock(item, redemptionCount) {
  if (typeof item.inventoryCount !== 'number' || !Number.isFinite(item.inventoryCount)) {
    return null;
  }

  return Math.max(0, item.inventoryCount - redemptionCount);
}

export function buildMarketOverview(store, user) {
  ensureMarketCatalogStore(store);

  if (!Array.isArray(store.rewardRedemptions)) {
    store.rewardRedemptions = [];
  }

  return buildMarketOverviewWithMetrics(store, user, getUserMetrics(store, user.id));
}

export function buildMarketOverviewWithMetrics(store, user, metrics) {
  const currentPoints = getAvailableRewardPoints(metrics, getRedeemedPointCost(store, user.id));
  const redemptionCountByItemId = buildRedemptionCountByItemId(store);

  const redeemedItemIds = new Set(
    store.rewardRedemptions
      .filter((entry) => entry.userId === user.id && isActiveRewardRedemption(entry))
      .map((entry) => entry.itemId),
  );

  const items = store.marketCatalog.map((item) => ({
    id: item.id,
    title: item.title,
    category: item.category,
    description: item.description,
    costPoints: item.costPoints,
    ...(item.partnerName ? { partnerName: item.partnerName } : {}),
    repeatable: item.repeatable,
    inventoryCount: typeof item.inventoryCount === 'number' ? item.inventoryCount : null,
    remainingStock: getMarketItemRemainingStock(item, redemptionCountByItemId.get(item.id) ?? 0),
    isActive: item.isActive !== false,
    claimState: item.isActive === false
      ? 'locked'
      : (getMarketItemRemainingStock(item, redemptionCountByItemId.get(item.id) ?? 0) === 0)
        ? 'locked'
        : redeemedItemIds.has(item.id)
      ? 'claimed'
      : currentPoints >= item.costPoints
        ? 'claimable'
        : 'locked',
  }));

  return {
    currentPoints,
    totalRedeemedCount: store.rewardRedemptions.filter((entry) => entry.userId === user.id && isActiveRewardRedemption(entry)).length,
    items,
  };
}

export function buildAdminMarketItem(store, item) {
  const redemptionCountByItemId = buildRedemptionCountByItemId(store);
  const redemptionCount = redemptionCountByItemId.get(item.id) ?? 0;

  return {
    id: item.id,
    title: item.title,
    category: item.category,
    description: item.description,
    costPoints: item.costPoints,
    ...(item.partnerName ? { partnerName: item.partnerName } : {}),
    repeatable: item.repeatable,
    isActive: item.isActive !== false,
    inventoryCount: typeof item.inventoryCount === 'number' ? item.inventoryCount : null,
    remainingStock: getMarketItemRemainingStock(item, redemptionCount),
    redemptionCount,
  };
}

export function buildAdminMarketCatalog(store) {
  ensureMarketCatalogStore(store);
  return {
    items: store.marketCatalog.map((item) => buildAdminMarketItem(store, item)),
  };
}

export function buildAdminRewardRedemption(store, redemption) {
  const user = store.users.find((entry) => entry.id === redemption.userId) ?? null;
  const item = (store.marketCatalog ?? []).find((entry) => entry.id === redemption.itemId) ?? null;
  const status = normalizeRewardRedemptionStatus(redemption.status);

  return {
    id: redemption.id,
    userId: redemption.userId,
    userName: user?.name ?? '알 수 없는 사용자',
    userTag: user?.publicTag ?? '',
    itemId: redemption.itemId,
    itemTitle: item?.title ?? '삭제된 상품',
    costPoints: typeof redemption.costPoints === 'number' ? redemption.costPoints : item?.costPoints ?? 0,
    status,
    claimedAt: redemption.claimedAt,
    ...(normalizeOptionalString(redemption.adminNote) ? { adminNote: redemption.adminNote } : {}),
    ...(normalizeOptionalString(redemption.fulfilledAt) ? { fulfilledAt: redemption.fulfilledAt } : {}),
  };
}

export function buildAdminRewardRedemptions(store) {
  ensureMarketCatalogStore(store);

  return {
    items: [...(store.rewardRedemptions ?? [])]
      .sort((left, right) => {
        const leftClaimedAt = normalizeOptionalString(left.claimedAt);
        const rightClaimedAt = normalizeOptionalString(right.claimedAt);
        return rightClaimedAt.localeCompare(leftClaimedAt);
      })
      .map((entry) => buildAdminRewardRedemption(store, entry)),
  };
}
