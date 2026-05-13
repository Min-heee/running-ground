export type MarketRewardClaimState = 'claimable' | 'claimed' | 'locked';

export type MarketRewardItem = {
  id: string;
  title: string;
  category: string;
  description: string;
  costPoints: number;
  partnerName?: string;
  repeatable: boolean;
  claimState: MarketRewardClaimState;
  inventoryCount?: number | null;
  remainingStock?: number | null;
  isActive?: boolean;
};

export type MarketOverview = {
  currentPoints: number;
  totalRedeemedCount: number;
  items: MarketRewardItem[];
};

export type MarketItem = MarketRewardItem;
export type RewardItem = MarketRewardItem;

export type Coupon = {
  id: string;
  rewardItemId: string;
  code: string;
  expiresAt?: string;
  redeemedAt?: string;
};

export type Redemption = {
  id: string;
  itemId: string;
  costPoints: number;
  redeemedAt: string;
  coupon?: Coupon;
};
