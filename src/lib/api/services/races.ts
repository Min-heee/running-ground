import {
  apiGet,
  apiPost,
} from '../client';

import { USE_MOCK_API } from '../config';

import {
  OfflineRaceEntryActionResponse,
  OfflineRaceHubResponse,
} from '../types';

import {
  buildMockOfflineRaceHub,
  mutateMockOfflineRaceRegistration,
  requireAccessToken,
} from './_shared';

export async function fetchOfflineRaceHub(): Promise<OfflineRaceHubResponse> {
  if (USE_MOCK_API) {
    return buildMockOfflineRaceHub();
  }

  return apiGet<OfflineRaceHubResponse>('/offline-races/hub', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '오프라인 마라톤 정보를 불러오지 못했어요.',
  });
}

export async function joinOfflineRace(eventId: string): Promise<OfflineRaceEntryActionResponse> {
  if (USE_MOCK_API) {
    return mutateMockOfflineRaceRegistration(eventId, 'join');
  }

  return apiPost<OfflineRaceEntryActionResponse>(
    `/offline-races/${eventId}/join`,
    {},
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '레이스 신청에 실패했어요.',
    },
  );
}

export async function cancelOfflineRace(eventId: string): Promise<OfflineRaceEntryActionResponse> {
  if (USE_MOCK_API) {
    return mutateMockOfflineRaceRegistration(eventId, 'cancel');
  }

  return apiPost<OfflineRaceEntryActionResponse>(
    `/offline-races/${eventId}/cancel`,
    {},
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '레이스 신청 취소에 실패했어요.',
    },
  );
}
