export async function routeRaceRequest({
  method,
  pathname,
  request,
  response,
  sendJson,
  buildOfflineRaceHubReadPayload,
  handleOfflineRaceEntryAction,
}) {
  if (pathname === '/api/offline-races/hub' && method === 'GET') {
    sendJson(response, 200, await buildOfflineRaceHubReadPayload(request));
    return true;
  }

  const offlineRaceActionMatch = pathname.match(/^\/api\/offline-races\/([^/]+)\/(join|cancel)$/);

  if (offlineRaceActionMatch && method === 'POST') {
    handleOfflineRaceEntryAction(request, response, offlineRaceActionMatch[1], offlineRaceActionMatch[2]);
    return true;
  }

  return false;
}
