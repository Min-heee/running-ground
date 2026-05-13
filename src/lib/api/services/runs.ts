import {
  friendRunRecords,
  myRunRecords,
  weeklySummary,
} from '@/data/mock';

import {
  apiGet,
  apiPatch,
  apiPost,
} from '../client';

import { USE_MOCK_API } from '../config';

import {
  CreateManualRunInput,
  CreateManualRunResponse,
  CreateRunningRoutePreviewInput,
  CreateRunningRoutePreviewResponse,
  CreateTrackedRunInput,
  CreateTrackedRunResponse,
  UpdateRunningLiveShareInput,
  UpdateRunningLiveShareResponse,
  MyActivityResponse,
  RunDetailResponse,
} from '../types';

import {
  mockApiState,
  buildMockPointBreakdown,
  normalizeMockFriendRanks,
  upsertMockCurrentUserRank,
  requireAccessToken,
} from './_shared';

import { fetchMyProfile } from './profile';

export async function fetchMyActivity(): Promise<MyActivityResponse> {
  if (USE_MOCK_API) {
    return {
      runs: myRunRecords,
      monthlyDistanceKm: Number(myRunRecords.reduce((sum, run) => sum + run.distanceKm, 0).toFixed(1)),
      monthlyPoints: weeklySummary.districtPoints,
    };
  }

  return apiGet<MyActivityResponse>('/me/activity', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '내 활동을 불러오지 못했어.',
  });
}

export async function createManualRun(input: CreateManualRunInput): Promise<CreateManualRunResponse> {
  if (USE_MOCK_API) {
    const distanceKm = Number(input.distanceKm.toFixed(1));
    const pointBreakdown = buildMockPointBreakdown(distanceKm >= 0.1 ? 10 : 0);

    return {
      run: {
        id: `mock-run-${Date.now()}`,
        date: input.date,
        distanceKm,
        pace: input.pace,
        source: 'Manual',
      },
      weeklyDistanceKm: distanceKm,
      estimatedMinutes: Math.round(distanceKm * 5.5),
      earnedPoint: pointBreakdown.totalPoints,
      pointBreakdown,
    };
  }

  const createdRun = await apiPost<CreateManualRunResponse>(
    '/runs/manual',
    {
      date: input.date,
      distanceKm: input.distanceKm,
      pace: input.pace,
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '수동 러닝 기록 저장에 실패했어.',
    },
  );

  await fetchMyProfile();
  return createdRun;
}

export async function createTrackedRun(input: CreateTrackedRunInput): Promise<CreateTrackedRunResponse> {
  if (USE_MOCK_API) {
    const distanceKm = Number(input.distanceKm.toFixed(1));
    const pointBreakdown = buildMockPointBreakdown(distanceKm >= 0.1 ? 10 : 0, input.matchResult);
    const trackedRun = {
      id: `tracked-run-${Date.now()}`,
      date: input.date,
      distanceKm,
      pace: input.pace,
      source: 'RunningGround',
      sourceType: 'runningground' as const,
      durationSeconds: input.durationSeconds,
      cadenceSpm: input.cadenceSpm ?? null,
      elevationGainM: input.elevationGainM ?? null,
      route: input.route,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      ...(input.matchResult ? { matchResult: input.matchResult } : {}),
    };

    myRunRecords.unshift(trackedRun);

    return {
      run: trackedRun,
      weeklyDistanceKm: distanceKm,
      estimatedMinutes: Math.round(input.durationSeconds / 60),
      earnedPoint: pointBreakdown.totalPoints,
      pointBreakdown,
    };
  }

  const createdRun = await apiPost<CreateTrackedRunResponse>(
    '/runs/tracked',
    {
      date: input.date,
      distanceKm: input.distanceKm,
      pace: input.pace,
      durationSeconds: input.durationSeconds,
      cadenceSpm: input.cadenceSpm ?? null,
      elevationGainM: input.elevationGainM ?? null,
      route: input.route,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      matchResult: input.matchResult ?? null,
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '실시간 러닝 기록 저장에 실패했어.',
    },
  );

  await fetchMyProfile();
  return createdRun;
}

export async function createRunningRoutePreview(
  input: CreateRunningRoutePreviewInput,
): Promise<CreateRunningRoutePreviewResponse> {
  if (USE_MOCK_API) {
    return {
      displayTitle: input.displayTitle,
      description: input.description,
      startLabel: input.startLabel,
      requestedKeyword: input.keyword,
      requestedDistanceKm: Number(input.desiredDistanceKm.toFixed(1)),
      estimatedDistanceKm: Number(input.desiredDistanceKm.toFixed(2)),
      coordinates: input.roughCoordinates,
      provider: 'template',
      roadFollowed: false,
      warning: '로컬 미리보기 모드에서는 도보 경로 엔진 대신 그림 윤곽선을 먼저 보여드려요.',
    };
  }

  return apiPost<CreateRunningRoutePreviewResponse>(
    '/running/route-preview',
    input,
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '추천 그림 경로를 만들지 못했어.',
    },
  );
}

export async function updateRunningLiveShare(
  input: UpdateRunningLiveShareInput,
): Promise<UpdateRunningLiveShareResponse> {
  if (USE_MOCK_API) {
    const currentUserRank = upsertMockCurrentUserRank();
    const isRunningNow = input.enabled && input.status === 'running';
    const normalizedLocationLabel = input.locationLabel?.trim();

    currentUserRank.isRunningNow = isRunningNow;
    currentUserRank.liveLocationLabel = isRunningNow && normalizedLocationLabel ? normalizedLocationLabel : undefined;
    mockApiState.friendRanks = normalizeMockFriendRanks(mockApiState.friendRanks);

    return {
      success: true,
      liveSharingEnabled: input.enabled,
      isRunningNow,
      ...(isRunningNow && normalizedLocationLabel ? { locationLabel: normalizedLocationLabel } : {}),
      updatedAt: new Date().toISOString(),
    };
  }

  return apiPatch<UpdateRunningLiveShareResponse>(
    '/me/live-sharing',
    {
      enabled: input.enabled,
      status: input.status,
      locationLabel: input.locationLabel?.trim() ?? '',
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '위치 공유 상태를 반영하지 못했어.',
    },
  );
}

export async function fetchRunDetail(input?: { runId?: string; friendId?: string }): Promise<RunDetailResponse> {
  if (USE_MOCK_API) {
    if (input?.friendId) {
      const run = input.runId
        ? (friendRunRecords.find((entry) => entry.id === input.runId) ?? friendRunRecords[0])
        : friendRunRecords[0];
      const pointBreakdown = buildMockPointBreakdown(Math.round(run.distanceKm * 2.4));

      return {
        run: {
          ...run,
          source: '친구 기록',
        },
        weeklyDistanceKm: weeklySummary.totalDistanceKm,
        estimatedMinutes: Math.round(run.distanceKm * 5.5),
        earnedPoint: pointBreakdown.totalPoints,
        pointBreakdown,
      };
    }

    const run = input?.runId
      ? (myRunRecords.find((entry) => entry.id === input.runId) ?? myRunRecords[0])
      : myRunRecords[0];
    const pointBreakdown = buildMockPointBreakdown(Math.round(run.distanceKm * 2.4), run.matchResult);

    return {
      run,
      weeklyDistanceKm: weeklySummary.totalDistanceKm,
      estimatedMinutes: Math.round(run.distanceKm * 5.5),
      earnedPoint: pointBreakdown.totalPoints,
      pointBreakdown,
    };
  }

  if (input?.friendId && input?.runId) {
    return apiGet<RunDetailResponse>(`/friends/${input.friendId}/runs/${input.runId}`, {
      accessToken: await requireAccessToken(),
      fallbackMessage: '친구 러닝 상세를 불러오지 못했어.',
    });
  }

  if (input?.runId) {
    return apiGet<RunDetailResponse>(`/runs/${input.runId}`, {
      accessToken: await requireAccessToken(),
      fallbackMessage: '러닝 상세를 불러오지 못했어.',
    });
  }

  return apiGet<RunDetailResponse>('/runs/latest', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '러닝 상세를 불러오지 못했어.',
  });
}
