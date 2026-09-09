import { buildLiveSharePatchBody } from '@/lib/api/services/liveShareBody';
import {
  friendRunRecords,
  myRunRecords,
  weeklySummary,
} from '@/data/mock';

import {
  apiGet,
  apiPatch,
  apiPost,
  LIVE_MATCH_REQUEST_TIMEOUT_MS,
  TRACKED_RUN_SAVE_TIMEOUT_MS,
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
import {
  ensureRunDetailResponse,
  ensureRunSaveResponse,
} from './runningRunResponseGuards';

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
    fallbackMessage: '내 활동을 불러오지 못했어요.',
  });
}

export async function createManualRun(input: CreateManualRunInput): Promise<CreateManualRunResponse> {
  if (USE_MOCK_API) {
    const distanceKm = Number(input.distanceKm.toFixed(1));
    const pointBreakdown = buildMockPointBreakdown(distanceKm >= 0.1 ? 10 : 0);

    return ensureRunSaveResponse({
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
    }, { action: 'create-manual-run' });
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
      fallbackMessage: '수동 러닝 기록 저장에 실패했어요.',
    },
  );

  await fetchMyProfile();
  return ensureRunSaveResponse(createdRun, { action: 'create-manual-run' });
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

    return ensureRunSaveResponse({
      run: trackedRun,
      weeklyDistanceKm: distanceKm,
      estimatedMinutes: Math.round(input.durationSeconds / 60),
      earnedPoint: pointBreakdown.totalPoints,
      pointBreakdown,
    }, { action: 'create-tracked-run' });
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
      ...(input.chaseArenaId ? { chaseArenaId: input.chaseArenaId } : {}),
      // 케이던스 감사 원장 — 필드를 명시 나열하는 바디라 여기 안 실으면 조용히 사라진다.
      ...(input.cadenceAudit ? { cadenceAudit: input.cadenceAudit } : {}),
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '실시간 러닝 기록 저장에 실패했어요.',
      // Full GPS route upload → allow a slow 1vCPU write to finish once instead of
      // aborting at 10s and re-sending the whole payload on retry.
      timeoutMs: TRACKED_RUN_SAVE_TIMEOUT_MS,
    },
  );

  // FIX-D2 (2026-07-09) — fire-and-forget: this hidden await added a full serialized RTT
  // (GET /me/profile, 10s default timeout) to every save's tap→run-detail path. No caller
  // depends on the refreshed profile synchronously with the save result (the save command
  // only reads savedRun.run.id; run-detail and home fetch their own data), so the cached
  // profile refresh can land whenever it lands.
  void fetchMyProfile().catch(() => {});
  return ensureRunSaveResponse(createdRun, { action: 'create-tracked-run' });
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
      fallbackMessage: '추천 그림 경로를 만들지 못했어요.',
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
    // body 조립은 buildLiveSharePatchBody 하나뿐이다 — 8/1 출시 이후 여기 인라인 body가
    // 좌표·거리·페이스·응원허용을 버려서 친구 라이브 지도가 영원히 스피너였다 (8/12 근치).
    buildLiveSharePatchBody(input),
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '위치 공유 상태를 반영하지 못했어요.',
      // Best-effort live-share sync fired at run start and on the live-share heartbeat —
      // a tight timeout keeps a stalled request from blocking the start flow and showing
      // the scary "위치 공유 상태를 반영하지 못했어요" banner for ~10s.
      timeoutMs: LIVE_MATCH_REQUEST_TIMEOUT_MS,
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

      return ensureRunDetailResponse({
        run: {
          ...run,
          source: '친구 기록',
        },
        weeklyDistanceKm: weeklySummary.totalDistanceKm,
        estimatedMinutes: Math.round(run.distanceKm * 5.5),
        earnedPoint: pointBreakdown.totalPoints,
        pointBreakdown,
      }, { action: 'fetch-run-detail' });
    }

    const run = input?.runId
      ? (myRunRecords.find((entry) => entry.id === input.runId) ?? myRunRecords[0])
      : myRunRecords[0];
    const pointBreakdown = buildMockPointBreakdown(Math.round(run.distanceKm * 2.4), run.matchResult);

    return ensureRunDetailResponse({
      run,
      weeklyDistanceKm: weeklySummary.totalDistanceKm,
      estimatedMinutes: Math.round(run.distanceKm * 5.5),
      earnedPoint: pointBreakdown.totalPoints,
      pointBreakdown,
    }, { action: 'fetch-run-detail' });
  }

  if (input?.friendId && input?.runId) {
    const payload = await apiGet<RunDetailResponse>(`/friends/${input.friendId}/runs/${input.runId}`, {
      accessToken: await requireAccessToken(),
      fallbackMessage: '친구 러닝 상세를 불러오지 못했어요.',
    });

    return ensureRunDetailResponse(payload, { action: 'fetch-friend-run-detail' });
  }

  if (input?.runId) {
    const payload = await apiGet<RunDetailResponse>(`/runs/${input.runId}`, {
      accessToken: await requireAccessToken(),
      fallbackMessage: '러닝 상세를 불러오지 못했어요.',
    });

    return ensureRunDetailResponse(payload, { action: 'fetch-run-detail' });
  }

  const payload = await apiGet<RunDetailResponse>('/runs/latest', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '러닝 상세를 불러오지 못했어요.',
  });

  return ensureRunDetailResponse(payload, { action: 'fetch-latest-run' });
}
