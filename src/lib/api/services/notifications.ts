import {
  apiGet,
  apiPost,
} from '../client';

import { USE_MOCK_API } from '../config';

import type {
  InboxResponse,
  MarkInboxReadResponse,
} from '../types';

import {
  mockApiState,
  requireAccessToken,
} from './_shared';

function buildMockInboxResponse(): InboxResponse {
  const items = [...mockApiState.inboxNotifications].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );

  return {
    items,
    unreadCount: items.filter((item) => !item.readAt).length,
  };
}

export async function fetchInbox(): Promise<InboxResponse> {
  if (USE_MOCK_API) {
    return buildMockInboxResponse();
  }

  return apiGet<InboxResponse>('/me/inbox', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '알림을 불러오지 못했어.',
  });
}

export async function markInboxRead(ids?: string[]): Promise<MarkInboxReadResponse> {
  if (USE_MOCK_API) {
    const idSet = Array.isArray(ids)
      ? new Set(ids.filter((id) => typeof id === 'string' && id.trim()))
      : null;
    const readAt = new Date().toISOString();

    mockApiState.inboxNotifications = mockApiState.inboxNotifications.map((item) => {
      if (item.readAt || (idSet && !idSet.has(item.id))) {
        return item;
      }

      return {
        ...item,
        readAt,
      };
    });

    return {
      unreadCount: mockApiState.inboxNotifications.filter((item) => !item.readAt).length,
    };
  }

  return apiPost<MarkInboxReadResponse>(
    '/me/inbox/read',
    ids ? { ids } : {},
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '알림 읽음 처리에 실패했어.',
    },
  );
}
