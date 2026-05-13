import type { MarketOverview, MarketRewardItem } from '@/domain';
import { resolveMarketClaimState } from '@/utils/marketRedemption';
import { mockApiState, mockMarketCatalog } from './state';

export function buildMockMarketOverview(): MarketOverview {
  const items: MarketRewardItem[] = mockMarketCatalog.map((item) => ({
    ...item,
    claimState: resolveMarketClaimState(
      {
        ...item,
        claimState: mockApiState.claimedMarketItemIds.has(item.id) ? 'claimed' : 'claimable',
      },
      mockApiState.marketPoints,
      mockApiState.claimedMarketItemIds,
    ),
  }));

  return {
    currentPoints: mockApiState.marketPoints,
    totalRedeemedCount: mockApiState.claimedMarketItemIds.size,
    items,
  };
}
