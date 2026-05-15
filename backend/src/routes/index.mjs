import { routeHealthRequest } from './healthRoutes.mjs';
import { routeAdminRequest } from './adminRoutes.mjs';
import { routeAuthRequest } from './authRoutes.mjs';
import { routeLeagueRequest } from './leagueRoutes.mjs';
import { routeMarketRequest } from './marketRoutes.mjs';
import { routeRaceRequest } from './raceRoutes.mjs';
import { routeRunningMatchRequest } from './runningMatchRoutes.mjs';
import { routeRunRequest } from './runRoutes.mjs';
import { routeSocialRequest } from './socialRoutes.mjs';

const ROUTE_HANDLERS = [
  routeHealthRequest,
  routeAdminRequest,
  routeAuthRequest,
  routeRunningMatchRequest,
  routeRunRequest,
  routeMarketRequest,
  routeRaceRequest,
  routeSocialRequest,
  routeLeagueRequest,
];

export function createApiRouteHandler({
  ApiError,
  sendJson,
  ...routeDependencies
}) {
  return async function routeRequest(request, response) {
    if (!request.url) {
      throw new ApiError(400, '요청 주소를 읽을 수 없어.');
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;
    const method = request.method;

    const routeContext = {
      ...routeDependencies,
      method,
      pathname,
      request,
      response,
      url,
      ApiError,
      sendJson,
    };

    for (const handleRoute of ROUTE_HANDLERS) {
      if (await handleRoute(routeContext)) {
        return;
      }
    }

    throw new ApiError(404, '요청한 API를 찾을 수 없어.');
  };
}
