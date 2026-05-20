import { routeRunningMatchProgressRoutes } from './runningMatch/runningMatchProgressRoutes.mjs';
import { routeRunningMatchRequestRoutes } from './runningMatch/runningMatchRequestRoutes.mjs';
import { routeRunningMatchRoomRoutes } from './runningMatch/runningMatchRoomRoutes.mjs';

export async function routeRunningMatchRequest(deps) {
  if (await routeRunningMatchRequestRoutes(deps)) {
    return true;
  }

  if (await routeRunningMatchProgressRoutes(deps)) {
    return true;
  }

  if (await routeRunningMatchRoomRoutes(deps)) {
    return true;
  }

  return false;
}
