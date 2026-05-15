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
    resetStore,
    getStoreFilePath,
    buildAdminStatus,
    handleDeleteAdminUser,
    handleCreateAdminMarketItem,
    handleUpdateAdminMarketItem,
    handleDeleteAdminMarketItem,
    handleCreateAdminNotice,
    handleUpdateAdminNotice,
    handleDeleteAdminNotice,
    handleUpdateAdminRewardRedemption,
    handleCreateAdminOfflineRaceEvent,
    handleUpdateAdminOfflineRaceEvent,
    handleDeleteAdminOfflineRaceEvent,
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
    handleDeleteAdminUser(response, adminUserMatch[1]);
    return true;
  }

  if (pathname === '/api/admin/market/items' && method === 'POST') {
    requireAdmin(request);
    await handleCreateAdminMarketItem(request, response);
    return true;
  }

  if (pathname === '/api/admin/notices' && method === 'POST') {
    requireAdmin(request);
    await handleCreateAdminNotice(request, response);
    return true;
  }

  const adminMarketItemMatch = pathname.match(/^\/api\/admin\/market\/items\/([^/]+)$/);

  if (adminMarketItemMatch && method === 'PATCH') {
    requireAdmin(request);
    await handleUpdateAdminMarketItem(request, response, adminMarketItemMatch[1]);
    return true;
  }

  if (adminMarketItemMatch && method === 'DELETE') {
    requireAdmin(request);
    handleDeleteAdminMarketItem(response, adminMarketItemMatch[1]);
    return true;
  }

  const adminNoticeMatch = pathname.match(/^\/api\/admin\/notices\/([^/]+)$/);

  if (adminNoticeMatch && method === 'PATCH') {
    requireAdmin(request);
    await handleUpdateAdminNotice(request, response, adminNoticeMatch[1]);
    return true;
  }

  if (adminNoticeMatch && method === 'DELETE') {
    requireAdmin(request);
    handleDeleteAdminNotice(response, adminNoticeMatch[1]);
    return true;
  }

  const adminRewardRedemptionMatch = pathname.match(/^\/api\/admin\/reward-redemptions\/([^/]+)$/);

  if (adminRewardRedemptionMatch && method === 'PATCH') {
    requireAdmin(request);
    await handleUpdateAdminRewardRedemption(request, response, adminRewardRedemptionMatch[1]);
    return true;
  }

  if (pathname === '/api/admin/offline-races/events' && method === 'POST') {
    requireAdmin(request);
    await handleCreateAdminOfflineRaceEvent(request, response);
    return true;
  }

  const adminOfflineRaceEventMatch = pathname.match(/^\/api\/admin\/offline-races\/events\/([^/]+)$/);

  if (adminOfflineRaceEventMatch && method === 'PATCH') {
    requireAdmin(request);
    await handleUpdateAdminOfflineRaceEvent(request, response, adminOfflineRaceEventMatch[1]);
    return true;
  }

  if (adminOfflineRaceEventMatch && method === 'DELETE') {
    requireAdmin(request);
    handleDeleteAdminOfflineRaceEvent(response, adminOfflineRaceEventMatch[1]);
    return true;
  }

  return false;
}
