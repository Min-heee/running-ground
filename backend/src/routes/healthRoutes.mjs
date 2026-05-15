export async function routeHealthRequest({
  method,
  pathname,
  response,
  sendJson,
  buildHealthStatus,
}) {
  if (pathname === '/api/health' && method === 'GET') {
    const healthStatus = buildHealthStatus();
    sendJson(response, healthStatus.statusCode, healthStatus.payload);
    return true;
  }

  return false;
}
