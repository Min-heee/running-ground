import {
  regionDrilldownTree,
} from '@/data/mock';

import type { TodayRankingCategory } from '@/domain';

import { addressCatalog } from '@/features/location/addressCatalog';

import {
  apiGet,
} from '../client';

import { USE_MOCK_API } from '../config';

import {
  DistrictPersonalResponse,
  RankLeaderboard,
  RegionLeagueResponse,
  RegionCatalogResponse,
  TodayRankingResponse,
} from '../types';

import {
  normalizeRegionChildren,
  requireAccessToken,
  findRegionPath,
  capRegionPathDepth,
  isRegionLeafLevel,
  buildMockDistrictPersonalResponse,
  buildMockRankLeaderboardResponse,
  buildMockTodayRankingResponse,
} from './_shared';

export async function fetchRegionCatalog(): Promise<RegionCatalogResponse> {
  if (USE_MOCK_API) {
    return {
      regions: addressCatalog,
    };
  }

  return apiGet<RegionCatalogResponse>('/catalog/regions', {
    fallbackMessage: '지역 목록을 불러오지 못했어요.',
  });
}

export async function fetchDistrictPersonal(nodeId?: string): Promise<DistrictPersonalResponse> {
  if (USE_MOCK_API) {
    return buildMockDistrictPersonalResponse(nodeId);
  }

  const query = nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : '';

  return apiGet<DistrictPersonalResponse>(`/league/district-personal${query}`, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '구 내 개인 경쟁 정보를 불러오지 못했어요.',
  });
}

export async function fetchRegionLeague(nodeId?: string): Promise<RegionLeagueResponse> {
  if (USE_MOCK_API) {
    const rawPath = nodeId ? (findRegionPath(regionDrilldownTree, nodeId) ?? [regionDrilldownTree]) : [regionDrilldownTree];
    // Cap the drill at the city level so 시/군 nodes are leaves (matches backend).
    const path = capRegionPathDepth(rawPath);
    const rawCurrentNode = path[path.length - 1];
    const parentNode = path[path.length - 2] ?? null;
    const normalizedSiblings = parentNode ? normalizeRegionChildren(parentNode.children ?? []) : [rawCurrentNode];
    const currentNode = normalizedSiblings.find((child) => child.id === rawCurrentNode.id) ?? rawCurrentNode;
    const children = isRegionLeafLevel(currentNode.level)
      ? []
      : normalizeRegionChildren(currentNode.children ?? []);

    return {
      currentNode,
      breadcrumb: path.map(({ id, name, level }) => ({ id, name, level })),
      children,
    };
  }

  const query = nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : '';

  return apiGet<RegionLeagueResponse>(`/league/regions${query}`, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '지역 랭킹 정보를 불러오지 못했어요.',
  });
}

export async function fetchTodayRanking(category: TodayRankingCategory): Promise<TodayRankingResponse> {
  if (USE_MOCK_API) {
    return buildMockTodayRankingResponse(category);
  }

  return apiGet<TodayRankingResponse>(`/running/today-rankings?category=${encodeURIComponent(category)}`, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '오늘의 랭킹을 불러오지 못했어요.',
  });
}

export async function fetchRankLeaderboard(): Promise<RankLeaderboard> {
  if (USE_MOCK_API) {
    return buildMockRankLeaderboardResponse();
  }

  return apiGet<RankLeaderboard>('/leagues/rank', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '랭크 랭킹을 불러오지 못했어요.',
  });
}
