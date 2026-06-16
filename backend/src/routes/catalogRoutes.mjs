export async function routeCatalogRequest({
  method,
  pathname,
  response,
  sendJson,
  loadStore,
  getAdminRepository,
  buildRegionCatalog,
  buildUniversityCatalog,
}) {
  if (pathname === '/api/catalog/regions' && method === 'GET') {
    sendJson(response, 200, buildRegionCatalog());
    return true;
  }

  if (pathname === '/api/catalog/universities' && method === 'GET') {
    const store = await loadStore();
    sendJson(response, 200, buildUniversityCatalog(store));
    return true;
  }

  if (pathname === '/api/notices/active' && method === 'GET') {
    sendJson(response, 200, await getAdminRepository().getActiveNotices());
    return true;
  }

  return false;
}
