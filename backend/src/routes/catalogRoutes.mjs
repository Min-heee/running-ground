export async function routeCatalogRequest({
  method,
  pathname,
  response,
  sendJson,
  getAdminRepository,
  buildRegionCatalog,
}) {
  if (pathname === '/api/catalog/regions' && method === 'GET') {
    sendJson(response, 200, buildRegionCatalog());
    return true;
  }

  if (pathname === '/api/notices/active' && method === 'GET') {
    sendJson(response, 200, await getAdminRepository().getActiveNotices());
    return true;
  }

  return false;
}
