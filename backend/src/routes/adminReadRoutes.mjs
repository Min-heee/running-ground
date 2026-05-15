function routeAdminStatusReadRequest({
  method,
  pathname,
  request,
  response,
  requireAdmin,
  sendJson,
  loadStore,
  buildAdminStatus,
  buildAdminSession,
  ENABLE_ADMIN_STATUS,
  ApiError,
}) {
  if (pathname === '/api/admin/status' && method === 'GET') {
    if (!ENABLE_ADMIN_STATUS) {
      throw new ApiError(404, '관리자 상태 확인 기능이 비활성화되어 있어.');
    }

    requireAdmin(request);
    const store = loadStore();
    sendJson(response, 200, buildAdminStatus(store));
    return true;
  }

  if (pathname === '/api/admin/session' && method === 'GET') {
    requireAdmin(request);
    sendJson(response, 200, buildAdminSession());
    return true;
  }

  return false;
}

function routeAdminRepositoryReadRequest({
  method,
  pathname,
  request,
  response,
  requireAdmin,
  sendJson,
  getAdminRepository,
}) {
  if (pathname === '/api/admin/overview' && method === 'GET') {
    requireAdmin(request);
    sendJson(response, 200, getAdminRepository().getOverview());
    return true;
  }

  if (pathname === '/api/admin/users' && method === 'GET') {
    requireAdmin(request);
    sendJson(response, 200, getAdminRepository().getUsers());
    return true;
  }

  if (pathname === '/api/admin/notices' && method === 'GET') {
    requireAdmin(request);
    sendJson(response, 200, getAdminRepository().getNotices());
    return true;
  }

  return false;
}

function routeAdminCatalogReadRequest({
  method,
  pathname,
  request,
  response,
  requireAdmin,
  sendJson,
  getMarketRepository,
  getRaceRepository,
}) {
  if (pathname === '/api/admin/market/items' && method === 'GET') {
    requireAdmin(request);
    sendJson(response, 200, getMarketRepository().getAdminCatalog());
    return true;
  }

  if (pathname === '/api/admin/reward-redemptions' && method === 'GET') {
    requireAdmin(request);
    sendJson(response, 200, getMarketRepository().getAdminRewardRedemptions());
    return true;
  }

  if (pathname === '/api/admin/offline-races/events' && method === 'GET') {
    requireAdmin(request);
    sendJson(response, 200, getRaceRepository().getAdminEvents());
    return true;
  }

  return false;
}

export function routeAdminReadRequest(routeContext) {
  return routeAdminStatusReadRequest(routeContext)
    || routeAdminRepositoryReadRequest(routeContext)
    || routeAdminCatalogReadRequest(routeContext);
}
