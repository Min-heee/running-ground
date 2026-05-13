import type { MarketOverview, MarketRewardItem } from '@/domain';
import { mockApiState, mockMarketCatalog } from './state';

export function buildMockMarketOverview(): MarketOverview {
  const items: MarketRewardItem[] = mockMarketCatalog.map((item) => ({
    ...item,
    claimState: mockApiState.claimedMarketItemIds.has(item.id)
      ? 'claimed'
      : mockApiState.marketPoints >= item.costPoints
        ? 'claimable'
        : 'locked',
  }));

  return {
    currentPoints: mockApiState.marketPoints,
    totalRedeemedCount: mockApiState.claimedMarketItemIds.size,
    items,
  };
}
