export async function routeMarketRequest({
  method,
  pathname,
  request,
  response,
  sendJson,
  buildMarketOverviewReadPayload,
  getAccessToken,
  getMarketRepository,
}) {
  if (pathname === '/api/market/overview' && method === 'GET') {
    sendJson(response, 200, await buildMarketOverviewReadPayload(request));
    return true;
  }

  const marketClaimMatch = pathname.match(/^\/api\/market\/items\/([^/]+)\/claim$/);

  if (marketClaimMatch && method === 'POST') {
    handleClaimMarketItem({
      getAccessToken,
      getMarketRepository,
      itemId: marketClaimMatch[1],
      request,
      response,
      sendJson,
    });
    return true;
  }

  return false;
}

function handleClaimMarketItem({
  getAccessToken,
  getMarketRepository,
  itemId,
  request,
  response,
  sendJson,
}) {
  const payload = getMarketRepository().claimItem({
    token: getAccessToken(request),
    itemId,
  });

  sendJson(response, 200, payload);
}
