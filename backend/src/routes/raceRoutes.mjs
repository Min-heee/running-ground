export async function routeRaceRequest({
  method,
  pathname,
  request,
  response,
  sendJson,
  buildOfflineRaceHubReadPayload,
  getAccessToken,
  getRaceRepository,
}) {
  if (pathname === '/api/offline-races/hub' && method === 'GET') {
    sendJson(response, 200, await buildOfflineRaceHubReadPayload(request));
    return true;
  }

  const offlineRaceActionMatch = pathname.match(/^\/api\/offline-races\/([^/]+)\/(join|cancel)$/);

  if (offlineRaceActionMatch && method === 'POST') {
    handleOfflineRaceEntryAction({
      action: offlineRaceActionMatch[2],
      eventId: offlineRaceActionMatch[1],
      getAccessToken,
      getRaceRepository,
      request,
      response,
      sendJson,
    });
    return true;
  }

  return false;
}

function handleOfflineRaceEntryAction({
  action,
  eventId,
  getAccessToken,
  getRaceRepository,
  request,
  response,
  sendJson,
}) {
  const payload = getRaceRepository().applyEntryAction({
    token: getAccessToken(request),
    eventId,
    action,
  });

  sendJson(response, 200, payload);
}
