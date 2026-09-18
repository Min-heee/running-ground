// 크루대전 API (오너 2026-09-18). 변경 요청은 전부 크루 홈 페이로드를 통째로 돌려준다(그라운드와
// 같은 관례) — 화면은 응답으로 바로 다시 그리고, 따로 재조회하지 않는다. 가입 신청 승인·거절만
// 신청 목록을 돌려준다. 목 분기는 웹 미리보기용(USE_MOCK_API).

import { apiGet, apiPost } from '../client';
import { USE_MOCK_API } from '../config';
import type {
  CrewDetailResponse,
  CrewHomeResponse,
  CrewLeagueResponse,
  CrewPreviewResponse,
  CrewRequestsResponse,
  CrewSearchResponse,
} from '../types';
import {
  buildMockCrewDetail,
  buildMockCrewHome,
  buildMockCrewLeague,
  buildMockCrewPreview,
  buildMockCrewSearch,
  mockCancelCrewJoinRequest,
  mockCreateCrew,
  mockDecideCrewJoinRequest,
  mockFetchCrewJoinRequests,
  mockJoinCrewByCode,
  mockKickCrewMember,
  mockLeaveCrew,
  mockRequestToJoinCrew,
  mockRotateCrewInviteCode,
  mockTransferCrewCaptain,
  requireAccessToken,
} from './_shared';

export async function fetchCrewHome(): Promise<CrewHomeResponse> {
  if (USE_MOCK_API) {
    return buildMockCrewHome();
  }

  return apiGet<CrewHomeResponse>('/crews/home', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '크루 정보를 불러오지 못했어요.',
  });
}

// season 없이 부르면 이번 시즌(라이브). 지난 시즌은 봉인 뒤엔 원장 스냅샷이 온다.
export async function fetchCrewLeague(seasonKey?: string): Promise<CrewLeagueResponse> {
  if (USE_MOCK_API) {
    return buildMockCrewLeague(seasonKey);
  }

  const query = seasonKey ? `?season=${encodeURIComponent(seasonKey)}` : '';

  return apiGet<CrewLeagueResponse>(`/crews/league${query}`, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '크루 순위를 불러오지 못했어요.',
  });
}

export async function fetchCrewDetail(crewId: string): Promise<CrewDetailResponse> {
  if (USE_MOCK_API) {
    return buildMockCrewDetail(crewId);
  }

  return apiGet<CrewDetailResponse>(`/crews/detail?crewId=${encodeURIComponent(crewId)}`, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '크루 정보를 불러오지 못했어요.',
  });
}

// 서버가 사용자당 10분에 10번으로 막는다 — 글자마다 부르지 말고 제출할 때만.
export async function searchCrews(query: string): Promise<CrewSearchResponse> {
  if (USE_MOCK_API) {
    return buildMockCrewSearch(query);
  }

  return apiGet<CrewSearchResponse>(`/crews/search?q=${encodeURIComponent(query.trim())}`, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '크루를 찾지 못했어요.',
  });
}

// 코드 미리보기도 10분에 10번 제한 — 6자리가 다 찼을 때만 부른다.
export async function previewCrewByCode(code: string): Promise<CrewPreviewResponse> {
  if (USE_MOCK_API) {
    return buildMockCrewPreview(code);
  }

  return apiGet<CrewPreviewResponse>(`/crews/preview?code=${encodeURIComponent(code)}`, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '크루를 불러오지 못했어요.',
  });
}

export async function createCrew(name: string): Promise<CrewHomeResponse> {
  if (USE_MOCK_API) {
    return mockCreateCrew(name);
  }

  return apiPost<CrewHomeResponse>('/crews', { name: name.trim() }, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '크루를 만들지 못했어요.',
  });
}

export async function joinCrewByCode(code: string): Promise<CrewHomeResponse> {
  if (USE_MOCK_API) {
    return mockJoinCrewByCode(code);
  }

  return apiPost<CrewHomeResponse>('/crews/join', { code }, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '크루에 들어가지 못했어요.',
  });
}

export async function requestToJoinCrew(crewId: string): Promise<CrewHomeResponse> {
  if (USE_MOCK_API) {
    return mockRequestToJoinCrew(crewId);
  }

  return apiPost<CrewHomeResponse>('/crews/requests', { crewId }, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '가입 신청을 보내지 못했어요.',
  });
}

export async function cancelCrewJoinRequest(requestId: string): Promise<CrewHomeResponse> {
  if (USE_MOCK_API) {
    return mockCancelCrewJoinRequest(requestId);
  }

  return apiPost<CrewHomeResponse>('/crews/requests/cancel', { requestId }, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '가입 신청을 취소하지 못했어요.',
  });
}

export async function fetchCrewJoinRequests(crewId: string): Promise<CrewRequestsResponse> {
  if (USE_MOCK_API) {
    return mockFetchCrewJoinRequests(crewId);
  }

  return apiGet<CrewRequestsResponse>(`/crews/requests?crewId=${encodeURIComponent(crewId)}`, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '가입 신청을 불러오지 못했어요.',
  });
}

export async function decideCrewJoinRequest(requestId: string, approve: boolean): Promise<CrewRequestsResponse> {
  if (USE_MOCK_API) {
    return mockDecideCrewJoinRequest(requestId, approve);
  }

  return apiPost<CrewRequestsResponse>('/crews/requests/decide', { requestId, approve }, {
    accessToken: await requireAccessToken(),
    fallbackMessage: approve ? '가입 신청을 승인하지 못했어요.' : '가입 신청을 거절하지 못했어요.',
  });
}

export async function leaveCrew(crewId: string): Promise<CrewHomeResponse> {
  if (USE_MOCK_API) {
    return mockLeaveCrew(crewId);
  }

  return apiPost<CrewHomeResponse>('/crews/leave', { crewId }, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '크루를 나가지 못했어요.',
  });
}

export async function kickCrewMember(crewId: string, userId: string): Promise<CrewHomeResponse> {
  if (USE_MOCK_API) {
    return mockKickCrewMember(crewId, userId);
  }

  return apiPost<CrewHomeResponse>('/crews/kick', { crewId, userId }, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '멤버를 내보내지 못했어요.',
  });
}

export async function transferCrewCaptain(crewId: string, userId: string): Promise<CrewHomeResponse> {
  if (USE_MOCK_API) {
    return mockTransferCrewCaptain(crewId, userId);
  }

  return apiPost<CrewHomeResponse>('/crews/captain', { crewId, userId }, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '캡틴을 넘기지 못했어요.',
  });
}

export async function rotateCrewInviteCode(crewId: string): Promise<CrewHomeResponse> {
  if (USE_MOCK_API) {
    return mockRotateCrewInviteCode(crewId);
  }

  return apiPost<CrewHomeResponse>('/crews/rotate-code', { crewId }, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '초대 코드를 새로 만들지 못했어요.',
  });
}
