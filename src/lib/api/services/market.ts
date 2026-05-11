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

export async function fetchMarketOverview(): Promise<MarketOverviewResponse> {
  if (USE_MOCK_API) {
    return buildMockMarketOverview();
  }

  return apiGet<MarketOverviewResponse>('/market/overview', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '마켓 정보를 불러오지 못했어.',
  });
}

export async function claimMarketItem(itemId: string): Promise<MarketClaimResponse> {
  if (USE_MOCK_API) {
    const item = mockMarketCatalog.find((entry) => entry.id === itemId);

    if (!item) {
      throw new Error('교환할 리워드를 찾지 못했어.');
    }

    if (!item.repeatable && mockApiState.claimedMarketItemIds.has(item.id)) {
      throw new Error('이미 교환한 리워드야.');
    }

    if (mockApiState.marketPoints < item.costPoints) {
      throw new Error('포인트가 부족해서 아직 교환할 수 없어.');
    }

    mockApiState.marketPoints -= item.costPoints;
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
      fallbackMessage: '리워드 교환에 실패했어.',
    },
  );
}
