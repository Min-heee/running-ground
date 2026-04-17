import { API_CONFIG } from './config';
import {
  AdminNoticeActionResponse,
  AdminNoticeInput,
  AdminNoticesResponse,
  AdminDeleteUserResponse,
  AdminMarketCatalogResponse,
  AdminMarketItemActionResponse,
  AdminMarketItemInput,
  AdminOfflineRaceEventActionResponse,
  AdminOfflineRaceEventInput,
  AdminOfflineRaceEventsResponse,
  AdminOverviewResponse,
  AdminRewardRedemptionActionResponse,
  AdminRewardRedemptionsResponse,
  AdminSessionResponse,
  AdminUsersResponse,
  UpdateAdminRewardRedemptionInput,
} from './types';

type AdminRequestOptions = {
  adminToken: string;
  fallbackMessage?: string;
};

async function readAdminErrorMessage(response: Response, fallbackMessage: string) {
  try {
    const payload = await response.json();

    if (typeof payload?.message === 'string') {
      return payload.message;
    }
  } catch {
    return fallbackMessage;
  }

  return fallbackMessage;
}

async function adminRequest<T>(
  path: string,
  init: RequestInit,
  { adminToken, fallbackMessage = '관리자 요청에 실패했어.' }: AdminRequestOptions,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_CONFIG.timeoutMs);
  const headers = new Headers(init.headers ?? {});

  headers.set('Accept', 'application/json');
  headers.set('X-Admin-Token', adminToken.trim());

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(`${API_CONFIG.baseUrl}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(await readAdminErrorMessage(response, fallbackMessage));
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('관리자 요청 시간이 초과됐어. 백엔드 주소와 네트워크를 확인해줘.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function requireAdminToken(adminToken: string) {
  if (!adminToken.trim()) {
    throw new Error('관리자 토큰을 입력해줘.');
  }

  return adminToken.trim();
}

export async function fetchAdminOverview(adminToken: string): Promise<AdminOverviewResponse> {
  return adminRequest('/admin/overview', { method: 'GET' }, {
    adminToken: requireAdminToken(adminToken),
    fallbackMessage: '관리자 개요를 불러오지 못했어.',
  });
}

export async function fetchAdminSession(adminToken: string): Promise<AdminSessionResponse> {
  return adminRequest('/admin/session', { method: 'GET' }, {
    adminToken: requireAdminToken(adminToken),
    fallbackMessage: '관리자 로그인 확인에 실패했어.',
  });
}

export async function fetchAdminUsers(adminToken: string): Promise<AdminUsersResponse> {
  return adminRequest('/admin/users', { method: 'GET' }, {
    adminToken: requireAdminToken(adminToken),
    fallbackMessage: '회원 목록을 불러오지 못했어.',
  });
}

export async function deleteAdminUser(adminToken: string, userId: string): Promise<AdminDeleteUserResponse> {
  return adminRequest(`/admin/users/${userId}`, { method: 'DELETE' }, {
    adminToken: requireAdminToken(adminToken),
    fallbackMessage: '회원 삭제에 실패했어.',
  });
}

export async function fetchAdminMarketItems(adminToken: string): Promise<AdminMarketCatalogResponse> {
  return adminRequest('/admin/market/items', { method: 'GET' }, {
    adminToken: requireAdminToken(adminToken),
    fallbackMessage: '마켓 목록을 불러오지 못했어.',
  });
}

export async function fetchAdminRewardRedemptions(adminToken: string): Promise<AdminRewardRedemptionsResponse> {
  return adminRequest('/admin/reward-redemptions', { method: 'GET' }, {
    adminToken: requireAdminToken(adminToken),
    fallbackMessage: '리워드 교환 목록을 불러오지 못했어.',
  });
}

export async function fetchAdminNotices(adminToken: string): Promise<AdminNoticesResponse> {
  return adminRequest('/admin/notices', { method: 'GET' }, {
    adminToken: requireAdminToken(adminToken),
    fallbackMessage: '공지 목록을 불러오지 못했어.',
  });
}

export async function createAdminMarketItem(
  adminToken: string,
  input: AdminMarketItemInput,
): Promise<AdminMarketItemActionResponse> {
  return adminRequest('/admin/market/items', {
    method: 'POST',
    body: JSON.stringify(input),
  }, {
    adminToken: requireAdminToken(adminToken),
    fallbackMessage: '마켓 상품 추가에 실패했어.',
  });
}

export async function updateAdminMarketItem(
  adminToken: string,
  itemId: string,
  input: AdminMarketItemInput,
): Promise<AdminMarketItemActionResponse> {
  return adminRequest(`/admin/market/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }, {
    adminToken: requireAdminToken(adminToken),
    fallbackMessage: '마켓 상품 수정에 실패했어.',
  });
}

export async function deleteAdminMarketItem(
  adminToken: string,
  itemId: string,
): Promise<AdminMarketCatalogResponse> {
  return adminRequest(`/admin/market/items/${itemId}`, { method: 'DELETE' }, {
    adminToken: requireAdminToken(adminToken),
    fallbackMessage: '마켓 상품 삭제에 실패했어.',
  });
}

export async function updateAdminRewardRedemption(
  adminToken: string,
  redemptionId: string,
  input: UpdateAdminRewardRedemptionInput,
): Promise<AdminRewardRedemptionActionResponse> {
  return adminRequest(`/admin/reward-redemptions/${redemptionId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }, {
    adminToken: requireAdminToken(adminToken),
    fallbackMessage: '리워드 교환 상태 수정에 실패했어.',
  });
}

export async function createAdminNotice(
  adminToken: string,
  input: AdminNoticeInput,
): Promise<AdminNoticeActionResponse> {
  return adminRequest('/admin/notices', {
    method: 'POST',
    body: JSON.stringify(input),
  }, {
    adminToken: requireAdminToken(adminToken),
    fallbackMessage: '공지 추가에 실패했어.',
  });
}

export async function updateAdminNotice(
  adminToken: string,
  noticeId: string,
  input: AdminNoticeInput,
): Promise<AdminNoticeActionResponse> {
  return adminRequest(`/admin/notices/${noticeId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }, {
    adminToken: requireAdminToken(adminToken),
    fallbackMessage: '공지 수정에 실패했어.',
  });
}

export async function deleteAdminNotice(
  adminToken: string,
  noticeId: string,
): Promise<AdminNoticesResponse> {
  return adminRequest(`/admin/notices/${noticeId}`, { method: 'DELETE' }, {
    adminToken: requireAdminToken(adminToken),
    fallbackMessage: '공지 삭제에 실패했어.',
  });
}

export async function fetchAdminOfflineRaceEvents(adminToken: string): Promise<AdminOfflineRaceEventsResponse> {
  return adminRequest('/admin/offline-races/events', { method: 'GET' }, {
    adminToken: requireAdminToken(adminToken),
    fallbackMessage: '레이스 목록을 불러오지 못했어.',
  });
}

export async function createAdminOfflineRaceEvent(
  adminToken: string,
  input: AdminOfflineRaceEventInput,
): Promise<AdminOfflineRaceEventActionResponse> {
  return adminRequest('/admin/offline-races/events', {
    method: 'POST',
    body: JSON.stringify(input),
  }, {
    adminToken: requireAdminToken(adminToken),
    fallbackMessage: '레이스 추가에 실패했어.',
  });
}

export async function updateAdminOfflineRaceEvent(
  adminToken: string,
  eventId: string,
  input: AdminOfflineRaceEventInput,
): Promise<AdminOfflineRaceEventActionResponse> {
  return adminRequest(`/admin/offline-races/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }, {
    adminToken: requireAdminToken(adminToken),
    fallbackMessage: '레이스 수정에 실패했어.',
  });
}

export async function deleteAdminOfflineRaceEvent(
  adminToken: string,
  eventId: string,
): Promise<AdminOfflineRaceEventsResponse> {
  return adminRequest(`/admin/offline-races/events/${eventId}`, { method: 'DELETE' }, {
    adminToken: requireAdminToken(adminToken),
    fallbackMessage: '레이스 삭제에 실패했어.',
  });
}
