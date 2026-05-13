export type PointReason =
  | 'distance'
  | 'streak'
  | 'growth'
  | 'match_bonus'
  | 'redemption'
  | 'adjustment';

export type PointTransaction = {
  id: string;
  reason: PointReason;
  points: number;
  createdAt: string;
  description?: string;
};

export type RewardPoint = {
  currentPoints: number;
  lifetimeEarnedPoints?: number;
  lifetimeRedeemedPoints?: number;
};
