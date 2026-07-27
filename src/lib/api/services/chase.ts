import { apiGet, apiPost } from '../client';

import { requireAccessToken } from './_shared';

import type {
  ChaseArenaListResponse,
  ChaseJoinResponse,
  ChaseLeaveResponse,
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

export async function leaveChaseArena(): Promise<ChaseLeaveResponse> {
  return apiPost<ChaseLeaveResponse>('/chase/leave', {}, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '경기장에서 나가지 못했어요.',
  });
}
