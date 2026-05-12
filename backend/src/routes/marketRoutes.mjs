export async function routeMarketRequest({
  method,
  pathname,
  request,
  response,
  sendJson,
  buildMarketOverviewReadPayload,
  handleClaimMarketItem,
}) {
  if (pathname === '/api/market/overview' && method === 'GET') {
    sendJson(response, 200, await buildMarketOverviewReadPayload(request));
    return true;
  }

  const marketClaimMatch = pathname.match(/^\/api\/market\/items\/([^/]+)\/claim$/);

  if (marketClaimMatch && method === 'POST') {
    handleClaimMarketItem(request, response, marketClaimMatch[1]);
    return true;
  }

  return false;
}
