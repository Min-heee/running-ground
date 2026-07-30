import { routeAdminReadRequest } from './adminReadRoutes.mjs';
import { sendExpoPushNotifications } from '../lib/expoPushSender.mjs';
import { collectPushTargets, removePushToken } from '../lib/pushTokens.mjs';
import { buildAdminInquiriesPayload, replyToInquiry } from '../lib/inquiries.mjs';
import {
  isAppleRevocationConfigured,
  revokeAppleRefreshToken,
} from '../lib/appleTokenRevocation.mjs';

export async function routeAdminRequest(routeContext) {
  if (await routeAdminReadRequest(routeContext)) {
    return true;
  }

  const {
    method,
    pathname,
    request,
    response,
    requireAdmin,
    sendJson,
    parseJsonBody,
    loadStore,
    mutateStore,
    resetStore,
    getStoreFilePath,
    buildAdminStatus,
    getAdminRepository,
    getMarketRepository,
    getRaceRepository,
    normalizeAdminMarketItemInput,
    normalizeAdminNoticeInput,
    normalizeAdminOfflineRaceEventInput,
    normalizeOptionalString,
    validateRewardRedemptionStatus,
    ENABLE_RESET_ENDPOINT,
    ApiError,
  } = routeContext;

  if (pathname === '/api/admin/reset' && method === 'POST') {
    if (!ENABLE_RESET_ENDPOINT) {
      throw new ApiError(404, '관리자 리셋 기능이 비활성화되어 있어요.');
    }

    requireAdmin(request);
    const nextStore = await resetStore();
    sendJson(response, 200, {
      success: true,
      storeFile: getStoreFilePath(),
      now: new Date().toISOString(),
      counts: buildAdminStatus(nextStore).counts,
    });
    return true;
  }

  const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);

  if (adminUserMatch && method === 'DELETE') {
    requireAdmin(request);
    await handleDeleteAdminUser({
      getAdminRepository,
      response,
      sendJson,
      userId: adminUserMatch[1],
    });
    return true;
  }

  if (pathname === '/api/admin/market/items' && method === 'POST') {
    requireAdmin(request);
    await handleCreateAdminMarketItem({
      getMarketRepository,
      normalizeAdminMarketItemInput,
      parseJsonBody,
      request,
      response,
      sendJson,
    });
    return true;
  }

  if (pathname === '/api/admin/notices' && method === 'POST') {
    requireAdmin(request);
    await handleCreateAdminNotice({
      getAdminRepository,
      loadStore,
      mutateStore,
      normalizeAdminNoticeInput,
      parseJsonBody,
      request,
      response,
      sendJson,
    });
    return true;
  }

  const adminMarketItemMatch = pathname.match(/^\/api\/admin\/market\/items\/([^/]+)$/);

  if (adminMarketItemMatch && method === 'PATCH') {
    requireAdmin(request);
    await handleUpdateAdminMarketItem({
      getMarketRepository,
      itemId: adminMarketItemMatch[1],
      normalizeAdminMarketItemInput,
      parseJsonBody,
      request,
      response,
      sendJson,
    });
    return true;
  }

  if (adminMarketItemMatch && method === 'DELETE') {
    requireAdmin(request);
    await handleDeleteAdminMarketItem({
      getMarketRepository,
      itemId: adminMarketItemMatch[1],
      response,
      sendJson,
    });
    return true;
  }

  const adminNoticeMatch = pathname.match(/^\/api\/admin\/notices\/([^/]+)$/);

  if (adminNoticeMatch && method === 'PATCH') {
    requireAdmin(request);
    await handleUpdateAdminNotice({
      getAdminRepository,
      normalizeAdminNoticeInput,
      noticeId: adminNoticeMatch[1],
      parseJsonBody,
      request,
      response,
      sendJson,
    });
    return true;
  }

  if (adminNoticeMatch && method === 'DELETE') {
    requireAdmin(request);
    await handleDeleteAdminNotice({
      getAdminRepository,
      noticeId: adminNoticeMatch[1],
      response,
      sendJson,
    });
    return true;
  }

  const adminRewardRedemptionMatch = pathname.match(/^\/api\/admin\/reward-redemptions\/([^/]+)$/);

  if (adminRewardRedemptionMatch && method === 'PATCH') {
    requireAdmin(request);
    await handleUpdateAdminRewardRedemption({
      getMarketRepository,
      normalizeOptionalString,
      parseJsonBody,
      redemptionId: adminRewardRedemptionMatch[1],
      request,
      response,
      sendJson,
      validateRewardRedemptionStatus,
    });
    return true;
  }

  // 문의 관리 — 목록/답변 (오너 2026-07-31).
  if (pathname === '/api/admin/inquiries' && method === 'GET') {
    requireAdmin(request);
    sendJson(response, 200, buildAdminInquiriesPayload(await loadStore()));
    return true;
  }

  const adminInquiryReplyMatch = pathname.match(/^\/api\/admin\/inquiries\/([^/]+)\/reply$/);

  if (adminInquiryReplyMatch && method === 'POST') {
    requireAdmin(request);
    const body = (await parseJsonBody(request)) ?? {};
    const payload = await mutateStore((store) => replyToInquiry(store, adminInquiryReplyMatch[1], { body: body.body }));
    sendJson(response, 200, payload);
    return true;
  }

  if (pathname === '/api/admin/offline-races/events' && method === 'POST') {
    requireAdmin(request);
    await handleCreateAdminOfflineRaceEvent({
      getRaceRepository,
      normalizeAdminOfflineRaceEventInput,
      parseJsonBody,
      request,
      response,
      sendJson,
    });
    return true;
  }

  const adminOfflineRaceEventMatch = pathname.match(/^\/api\/admin\/offline-races\/events\/([^/]+)$/);

  if (adminOfflineRaceEventMatch && method === 'PATCH') {
    requireAdmin(request);
    await handleUpdateAdminOfflineRaceEvent({
      eventId: adminOfflineRaceEventMatch[1],
      getRaceRepository,
      normalizeAdminOfflineRaceEventInput,
      parseJsonBody,
      request,
      response,
      sendJson,
    });
    return true;
  }

  if (adminOfflineRaceEventMatch && method === 'DELETE') {
    requireAdmin(request);
    await handleDeleteAdminOfflineRaceEvent({
      eventId: adminOfflineRaceEventMatch[1],
      getRaceRepository,
      response,
      sendJson,
    });
    return true;
  }

  return false;
}

async function handleDeleteAdminUser({
  getAdminRepository,
  response,
  sendJson,
  userId,
}) {
  const { appleRefreshToken, ...payload } = await getAdminRepository().deleteUser({
    userId,
  });

  sendJson(response, 200, payload);

  // 관리자 삭제도 애플 토큰 철회(5.1.1) 대상. 응답 후 fire-and-forget — 실패는 로그만.
  if (appleRefreshToken && isAppleRevocationConfigured()) {
    void revokeAppleRefreshToken(appleRefreshToken).catch((error) => {
      console.error(
        `[runningground-backend] 관리자 삭제 애플 토큰 철회 실패 (삭제는 완료됨): ${error?.message ?? error}`,
      );
    });
  }
}

async function handleCreateAdminMarketItem({
  getMarketRepository,
  normalizeAdminMarketItemInput,
  parseJsonBody,
  request,
  response,
  sendJson,
}) {
  const body = await parseJsonBody(request);
  const payload = await getMarketRepository().createAdminItem({
    input: normalizeAdminMarketItemInput(body),
  });

  sendJson(response, 201, payload);
}

async function handleUpdateAdminMarketItem({
  getMarketRepository,
  itemId,
  normalizeAdminMarketItemInput,
  parseJsonBody,
  request,
  response,
  sendJson,
}) {
  const body = await parseJsonBody(request);
  const payload = await getMarketRepository().updateAdminItem({
    itemId,
    input: normalizeAdminMarketItemInput(body),
  });

  sendJson(response, 200, payload);
}

async function handleDeleteAdminMarketItem({
  getMarketRepository,
  itemId,
  response,
  sendJson,
}) {
  const payload = await getMarketRepository().deleteAdminItem({
    itemId,
  });

  sendJson(response, 200, payload);
}

async function handleCreateAdminNotice({
  getAdminRepository,
  loadStore,
  mutateStore,
  normalizeAdminNoticeInput,
  parseJsonBody,
  request,
  response,
  sendJson,
}) {
  const body = await parseJsonBody(request);
  const payload = await getAdminRepository().createNotice({
    input: normalizeAdminNoticeInput(body),
  });

  sendJson(response, 201, payload);

  // 공지 등록 = 전체 푸시 (오너 2026-07-31). 응답을 보낸 뒤 fire-and-forget —
  // 푸시 게이트웨이가 느리거나 죽어도 관리자 요청은 이미 성공으로 끝나 있다.
  // 노출 off로 만든 공지는 보내지 않는다.
  const notice = payload?.item ?? null;

  if (notice?.isActive) {
    void sendNoticePushNotification({ loadStore, mutateStore, notice }).catch(() => {});
  }
}

// 공지 푸시 — 마켓/친구 알림 설정과 무관한 '서비스 공지'라 설정 게이트 없이 전원 발송.
async function sendNoticePushNotification({ loadStore, mutateStore, notice }) {
  const tokens = collectPushTargets(await loadStore());

  if (tokens.length === 0) {
    return;
  }

  await sendExpoPushNotifications(
    tokens,
    {
      title: notice.title,
      body: notice.message,
      data: { type: 'notice', noticeId: notice.id },
    },
    {
      onInvalidTokens: async (invalidTokens) => {
        await mutateStore((store) => {
          for (const token of invalidTokens) {
            removePushToken(store, token);
          }

          return null;
        });
      },
    },
  );
}

async function handleUpdateAdminNotice({
  getAdminRepository,
  normalizeAdminNoticeInput,
  noticeId,
  parseJsonBody,
  request,
  response,
  sendJson,
}) {
  const body = await parseJsonBody(request);
  const payload = await getAdminRepository().updateNotice({
    noticeId,
    input: normalizeAdminNoticeInput(body),
  });

  sendJson(response, 200, payload);
}

async function handleDeleteAdminNotice({
  getAdminRepository,
  noticeId,
  response,
  sendJson,
}) {
  const payload = await getAdminRepository().deleteNotice({
    noticeId,
  });

  sendJson(response, 200, payload);
}

async function handleUpdateAdminRewardRedemption({
  getMarketRepository,
  normalizeOptionalString,
  parseJsonBody,
  redemptionId,
  request,
  response,
  sendJson,
  validateRewardRedemptionStatus,
}) {
  const body = await parseJsonBody(request);
  const payload = await getMarketRepository().updateAdminRewardRedemption({
    redemptionId,
    status: validateRewardRedemptionStatus(body.status),
    adminNote: normalizeOptionalString(body.adminNote),
  });

  sendJson(response, 200, payload);
}

async function handleCreateAdminOfflineRaceEvent({
  getRaceRepository,
  normalizeAdminOfflineRaceEventInput,
  parseJsonBody,
  request,
  response,
  sendJson,
}) {
  const body = await parseJsonBody(request);
  const payload = await getRaceRepository().createAdminEvent({
    input: normalizeAdminOfflineRaceEventInput(body),
  });

  sendJson(response, 201, payload);
}

async function handleUpdateAdminOfflineRaceEvent({
  eventId,
  getRaceRepository,
  normalizeAdminOfflineRaceEventInput,
  parseJsonBody,
  request,
  response,
  sendJson,
}) {
  const body = await parseJsonBody(request);
  const payload = await getRaceRepository().updateAdminEvent({
    eventId,
    input: normalizeAdminOfflineRaceEventInput(body),
  });

  sendJson(response, 200, payload);
}

async function handleDeleteAdminOfflineRaceEvent({
  eventId,
  getRaceRepository,
  response,
  sendJson,
}) {
  const payload = await getRaceRepository().deleteAdminEvent({
    eventId,
  });

  sendJson(response, 200, payload);
}
