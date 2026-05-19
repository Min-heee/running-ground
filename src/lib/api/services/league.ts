import {
  myProfile,
  regionDrilldownTree,
  universityLeagueRanks,
  weeklySummary,
} from '@/data/mock';

import type { TodayRankingCategory } from '@/domain';

import { addressCatalog } from '@/features/location/addressCatalog';

import {
  getCurrentUserProfile,
} from '@/lib/session';

import {
  apiGet,
} from '../client';

import { USE_MOCK_API } from '../config';

import {
  DistrictPersonalResponse,
  RegionLeagueResponse,
  RegionCatalogResponse,
  TodayRankingResponse,
  UniversityCatalogResponse,
  UniversityLeagueResponse,
} from '../types';

import {
  normalizeMockUniversityRanks,
  normalizeRegionChildren,
  requireAccessToken,
  findRegionPath,
  buildMockDistrictPersonalResponse,
  buildMockTodayRankingResponse,
} from './_shared';

export async function fetchRegionCatalog(): Promise<RegionCatalogResponse> {
  if (USE_MOCK_API) {
    return {
      regions: addressCatalog,
    };
  }

  return apiGet<RegionCatalogResponse>('/catalog/regions', {
    fallbackMessage: '지역 목록을 불러오지 못했어.',
  });
}

export async function fetchUniversityCatalog(): Promise<UniversityCatalogResponse> {
  if (USE_MOCK_API) {
    return {
      universities: [...new Set(universityLeagueRanks.map((entry) => entry.universityName))],
    };
  }

  return apiGet<UniversityCatalogResponse>('/catalog/universities', {
    fallbackMessage: '대학 목록을 불러오지 못했어.',
  });
}

export async function fetchDistrictPersonal(nodeId?: string): Promise<DistrictPersonalResponse> {
  if (USE_MOCK_API) {
    return buildMockDistrictPersonalResponse(nodeId);
  }

  const query = nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : '';

  return apiGet<DistrictPersonalResponse>(`/league/district-personal${query}`, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '구 내 개인 경쟁 정보를 불러오지 못했어.',
  });
}

export async function fetchRegionLeague(nodeId?: string): Promise<RegionLeagueResponse> {
  if (USE_MOCK_API) {
    const path = nodeId ? (findRegionPath(regionDrilldownTree, nodeId) ?? [regionDrilldownTree]) : [regionDrilldownTree];
    const rawCurrentNode = path[path.length - 1];
    const parentNode = path[path.length - 2] ?? null;
    const normalizedSiblings = parentNode ? normalizeRegionChildren(parentNode.children ?? []) : [rawCurrentNode];
    const currentNode = normalizedSiblings.find((child) => child.id === rawCurrentNode.id) ?? rawCurrentNode;
    const children = normalizeRegionChildren(currentNode.children ?? []);

    return {
      currentNode,
      breadcrumb: path.map(({ id, name, level }) => ({ id, name, level })),
      children,
    };
  }

  const query = nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : '';

  return apiGet<RegionLeagueResponse>(`/league/regions${query}`, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '지역 랭킹 정보를 불러오지 못했어.',
  });
}

export async function fetchUniversityLeague(): Promise<UniversityLeagueResponse> {
  if (USE_MOCK_API) {
    const profile = getCurrentUserProfile() ?? myProfile;
    const normalizedUniversityName = profile.universityName?.trim() ?? '';
    const ranks = universityLeagueRanks.map((entry) => ({ ...entry }));

    if (normalizedUniversityName) {
      const existingRank = ranks.find((entry) => entry.universityName === normalizedUniversityName);

      if (existingRank) {
        existingRank.totalDistanceKm = Number((existingRank.totalDistanceKm + weeklySummary.totalDistanceKm).toFixed(1));
        existingRank.participants += 1;
      } else {
        ranks.push({
          rank: ranks.length + 1,
          universityName: normalizedUniversityName,
          totalDistanceKm: weeklySummary.totalDistanceKm,
          participants: 1,
          averageDistanceKm: Number(weeklySummary.totalDistanceKm.toFixed(1)),
        });
      }
    }

    return {
      ranks: normalizeMockUniversityRanks(ranks),
    };
  }

  return apiGet<UniversityLeagueResponse>('/league/universities', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '대학 리그 정보를 불러오지 못했어.',
  });
}

export async function fetchTodayRanking(category: TodayRankingCategory): Promise<TodayRankingResponse> {
  if (USE_MOCK_API) {
    return buildMockTodayRankingResponse(category);
  }

  return apiGet<TodayRankingResponse>(`/running/today-rankings?category=${encodeURIComponent(category)}`, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '오늘의 랭킹을 불러오지 못했어.',
  });
}
