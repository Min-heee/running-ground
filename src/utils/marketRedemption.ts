import type { MarketRewardClaimState, MarketRewardItem } from '@/domain';

export type MarketRedemptionItem = Pick<
  MarketRewardItem,
  'id' | 'costPoints' | 'repeatable' | 'claimState' | 'inventoryCount' | 'remainingStock' | 'isActive'
>;

export type MarketRedemptionFailureReason =
  | 'missing-item'
  | 'invalid-points'
  | 'inactive'
  | 'out-of-stock'
  | 'already-claimed'
  | 'insufficient-points';

export type MarketRedemptionCheck =
  | {
    canRedeem: true;
    itemId: string;
    remainingPoints: number;
  }
  | {
    canRedeem: false;
    reason: MarketRedemptionFailureReason;
    message: string;
  };

function isAlreadyClaimed(item: MarketRedemptionItem, claimedItemIds?: ReadonlySet<string>) {
  return item.claimState === 'claimed' || Boolean(claimedItemIds?.has(item.id));
}

function hasStock(item: MarketRedemptionItem) {
  const stock = typeof item.remainingStock === 'number'
    ? item.remainingStock
    : item.inventoryCount;

  return typeof stock !== 'number' || stock > 0;
}

export function checkMarketRedemptionEligibility(
  item: MarketRedemptionItem | null | undefined,
  currentPoints: number,
  claimedItemIds?: ReadonlySet<string>,
): MarketRedemptionCheck {
  if (!item) {
    return {
      canRedeem: false,
      reason: 'missing-item',
      message: '교환할 리워드를 찾지 못했어요.',
    };
  }

  if (!Number.isFinite(currentPoints) || currentPoints < 0 || !Number.isFinite(item.costPoints) || item.costPoints < 0) {
    return {
      canRedeem: false,
      reason: 'invalid-points',
      message: '포인트 정보를 확인하지 못했어요.',
    };
  }

  if (item.isActive === false) {
    return {
      canRedeem: false,
      reason: 'inactive',
      message: '현재 교환할 수 없는 리워드예요.',
    };
  }

  if (!hasStock(item)) {
    return {
      canRedeem: false,
      reason: 'out-of-stock',
      message: '재고가 모두 소진됐어요.',
    };
  }

  if (!item.repeatable && isAlreadyClaimed(item, claimedItemIds)) {
    return {
      canRedeem: false,
      reason: 'already-claimed',
      message: '이미 교환한 리워드예요.',
    };
  }

  if (currentPoints < item.costPoints) {
    return {
      canRedeem: false,
      reason: 'insufficient-points',
      message: '포인트가 부족해서 아직 교환할 수 없어요.',
    };
  }

  return {
    canRedeem: true,
    itemId: item.id,
    remainingPoints: currentPoints - item.costPoints,
  };
}

export function resolveMarketClaimState(
  item: MarketRedemptionItem,
  currentPoints: number,
  claimedItemIds?: ReadonlySet<string>,
): MarketRewardClaimState {
  if (!item.repeatable && isAlreadyClaimed(item, claimedItemIds)) {
    return 'claimed';
  }

  return checkMarketRedemptionEligibility(item, currentPoints, claimedItemIds).canRedeem
    ? 'claimable'
    : 'locked';
}
