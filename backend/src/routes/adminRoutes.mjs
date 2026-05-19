import { routeAdminReadRequest } from './adminReadRoutes.mjs';

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
      throw new ApiError(404, '관리자 리셋 기능이 비활성화되어 있어.');
    }

    requireAdmin(request);
    const nextStore = resetStore();
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
    handleDeleteAdminUser({
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
    handleDeleteAdminMarketItem({
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
    handleDeleteAdminNotice({
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
    handleDeleteAdminOfflineRaceEvent({
      eventId: adminOfflineRaceEventMatch[1],
      getRaceRepository,
      response,
      sendJson,
    });
    return true;
  }

  return false;
}

function handleDeleteAdminUser({
  getAdminRepository,
  response,
  sendJson,
  userId,
}) {
  const payload = getAdminRepository().deleteUser({
    userId,
  });

  sendJson(response, 200, payload);
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
  const payload = getMarketRepository().createAdminItem({
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
  const payload = getMarketRepository().updateAdminItem({
    itemId,
    input: normalizeAdminMarketItemInput(body),
  });

  sendJson(response, 200, payload);
}

function handleDeleteAdminMarketItem({
  getMarketRepository,
  itemId,
  response,
  sendJson,
}) {
  const payload = getMarketRepository().deleteAdminItem({
    itemId,
  });

  sendJson(response, 200, payload);
}

async function handleCreateAdminNotice({
  getAdminRepository,
  normalizeAdminNoticeInput,
  parseJsonBody,
  request,
  response,
  sendJson,
}) {
  const body = await parseJsonBody(request);
  const payload = getAdminRepository().createNotice({
    input: normalizeAdminNoticeInput(body),
  });

  sendJson(response, 201, payload);
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
  const payload = getAdminRepository().updateNotice({
    noticeId,
    input: normalizeAdminNoticeInput(body),
  });

  sendJson(response, 200, payload);
}

function handleDeleteAdminNotice({
  getAdminRepository,
  noticeId,
  response,
  sendJson,
}) {
  const payload = getAdminRepository().deleteNotice({
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
  const payload = getMarketRepository().updateAdminRewardRedemption({
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
  const payload = getRaceRepository().createAdminEvent({
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
  const payload = getRaceRepository().updateAdminEvent({
    eventId,
    input: normalizeAdminOfflineRaceEventInput(body),
  });

  sendJson(response, 200, payload);
}

function handleDeleteAdminOfflineRaceEvent({
  eventId,
  getRaceRepository,
  response,
  sendJson,
}) {
  const payload = getRaceRepository().deleteAdminEvent({
    eventId,
  });

  sendJson(response, 200, payload);
}
