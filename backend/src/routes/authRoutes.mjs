import { routeAuthLoginRequest } from './authLoginRoutes.mjs';
import { routeAuthPhoneVerificationRequest } from './authPhoneVerificationRoutes.mjs';
import { routeAuthRegisterRequest } from './authRegisterRoutes.mjs';
import { routeCatalogRequest } from './catalogRoutes.mjs';
import { routeMeNotificationRequest } from './meNotificationRoutes.mjs';
import { routeMeProfileRequest } from './meProfileRoutes.mjs';

export async function routeAuthRequest(routeContext) {
  if (await routeAuthLoginRequest(routeContext)) {
    return true;
  }

  if (await routeAuthPhoneVerificationRequest(routeContext)) {
    return true;
  }

  if (await routeAuthRegisterRequest(routeContext)) {
    return true;
  }

  if (await routeMeProfileRequest(routeContext)) {
    return true;
  }

  if (await routeMeNotificationRequest(routeContext)) {
    return true;
  }

  if (await routeCatalogRequest(routeContext)) {
    return true;
  }

  return false;
}
