// 런마당 API — chase.ts와 같은 최소 형태 (목 분기 없음).

import { apiGet, apiPost } from '../client';
import type { CreateRunmadangInput, RunmadangMineResponse } from '../types/runmadang';
import { requireAccessToken } from './_shared';

export async function fetchRunmadangMine(): Promise<RunmadangMineResponse> {
  return apiGet<RunmadangMineResponse>('/runmadang/mine', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '런마당 목록을 불러오지 못했어요.',
  });
}

export async function createRunmadang(input: CreateRunmadangInput): Promise<RunmadangMineResponse> {
  return apiPost<RunmadangMineResponse>('/runmadang', input, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '런마당을 만들지 못했어요.',
  });
}

export async function joinRunmadang(challengeId: string): Promise<RunmadangMineResponse> {
  return apiPost<RunmadangMineResponse>('/runmadang/join', { challengeId }, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '런마당에 참가하지 못했어요.',
  });
}

export async function declineRunmadang(challengeId: string): Promise<RunmadangMineResponse> {
  return apiPost<RunmadangMineResponse>('/runmadang/decline', { challengeId }, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '초대를 거절하지 못했어요.',
  });
}

export async function cancelRunmadang(challengeId: string): Promise<RunmadangMineResponse> {
  return apiPost<RunmadangMineResponse>('/runmadang/cancel', { challengeId }, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '런마당을 취소하지 못했어요.',
  });
}

export async function withdrawRunmadang(challengeId: string): Promise<RunmadangMineResponse> {
  return apiPost<RunmadangMineResponse>('/runmadang/withdraw', { challengeId }, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '참가를 철회하지 못했어요.',
  });
}
