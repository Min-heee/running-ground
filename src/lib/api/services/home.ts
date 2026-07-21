import {
  weeklySummary,
} from '@/data/mock';

import {
  apiGet,
} from '../client';

import { USE_MOCK_API } from '../config';

import {
  ActiveNoticesResponse,
  HomeSummaryResponse,
} from '../types';

import {
  requireAccessToken,
} from './_shared';

export async function fetchHomeSummary(): Promise<HomeSummaryResponse> {
  if (USE_MOCK_API) {
    return weeklySummary;
  }

  return apiGet<HomeSummaryResponse>('/home/summary', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '홈 요약을 불러오지 못했어요.',
  });
}

export async function fetchActiveNotices(): Promise<ActiveNoticesResponse> {
  if (USE_MOCK_API) {
    return {
      items: [],
    };
  }

  return apiGet<ActiveNoticesResponse>('/notices/active', {
    fallbackMessage: '공지 정보를 불러오지 못했어요.',
  });
}
