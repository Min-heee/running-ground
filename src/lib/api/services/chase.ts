import { apiGet, apiPost } from '../client';

import { requireAccessToken } from './_shared';

import type {
  ChaseArenaListResponse,
  ChaseJoinResponse,
  ChaseLeaveResponse,
  ChaseLiveResponse,
  ChaseOverviewResponse,
  ChasePositionInput,
} from '../types';

// 경찰과 도둑런 경기장 카탈로그 + 실시간 점유(30/100).
export async function fetchChaseArenas(): Promise<ChaseArenaListResponse> {
  return apiGet<ChaseArenaListResponse>('/chase/arenas', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '경기장 목록을 불러오지 못했어요.',
  });
}

// 러닝 시작 직전 슬롯 확보 — 정원 초과면 서버가 400으로 알려준다.
export async function joinChaseArena(arenaId: string): Promise<ChaseJoinResponse> {
  return apiPost<ChaseJoinResponse>('/chase/join', { arenaId }, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '경기장에 입장하지 못했어요.',
  });
}

// 시작 전 경기장 미리보기 — 익명 점 + 인원 수 (로그인 사용자 누구나).
export async function fetchChaseOverview(arenaId: string): Promise<ChaseOverviewResponse> {
  return apiGet<ChaseOverviewResponse>(`/chase/overview?arenaId=${encodeURIComponent(arenaId)}`, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '경기장 정보를 불러오지 못했어요.',
  });
}

// 러닝 중 위치 하트비트 (10초 주기) — 라이브 지도의 공급면. 실패는 조용히 다음 틱이 만회.
export async function updateChasePosition(input: ChasePositionInput): Promise<{ success: boolean }> {
  return apiPost<{ success: boolean }>('/chase/position', input, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '위치를 공유하지 못했어요.',
  });
}

// 라이브 지도 — 그 경기장에 입장한 러너만 (서버가 403으로 가드).
export async function fetchChaseLive(arenaId: string): Promise<ChaseLiveResponse> {
  return apiGet<ChaseLiveResponse>(`/chase/live?arenaId=${encodeURIComponent(arenaId)}`, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '라이브 지도를 불러오지 못했어요.',
  });
}

export async function leaveChaseArena(): Promise<ChaseLeaveResponse> {
  return apiPost<ChaseLeaveResponse>('/chase/leave', {}, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '경기장에서 나가지 못했어요.',
  });
}
