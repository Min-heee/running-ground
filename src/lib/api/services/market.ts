import {
  apiGet,
  apiPost,
} from '../client';

import { USE_MOCK_API } from '../config';

import {
  MarketClaimResponse,
  MarketOverviewResponse,
} from '../types';

import {
  mockMarketCatalog,
  mockApiState,
  buildMockMarketOverview,
  requireAccessToken,
} from './_shared';
import { checkMarketRedemptionEligibility } from '@/utils/marketRedemption';

export async function fetchMarketOverview(): Promise<MarketOverviewResponse> {
  if (USE_MOCK_API) {
    return buildMockMarketOverview();
  }

  return apiGet<MarketOverviewResponse>('/market/overview', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '마켓 정보를 불러오지 못했어요.',
  });
}

export async function claimMarketItem(itemId: string): Promise<MarketClaimResponse> {
  if (USE_MOCK_API) {
    const item = mockMarketCatalog.find((entry) => entry.id === itemId);

    if (!item) {
      throw new Error('교환할 리워드를 찾지 못했어요.');
    }

    const eligibility = checkMarketRedemptionEligibility(
      {
        ...item,
        claimState: mockApiState.claimedMarketItemIds.has(item.id) ? 'claimed' : 'claimable',
      },
      mockApiState.marketPoints,
      mockApiState.claimedMarketItemIds,
    );

    if (!eligibility.canRedeem) {
      throw new Error(eligibility.message);
    }

    mockApiState.marketPoints = eligibility.remainingPoints;
    mockApiState.claimedMarketItemIds.add(item.id);

    return {
      success: true,
      claimedItemId: item.id,
      overview: buildMockMarketOverview(),
    };
  }

  return apiPost<MarketClaimResponse>(
    `/market/items/${itemId}/claim`,
    {},
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '리워드 교환에 실패했어요.',
    },
  );
}
