export async function routeAuthRequest({
  method,
  pathname,
  request,
  response,
  url,
  sendJson,
  loadStore,
  getAdminRepository,
  getAuthRepository,
  buildRegionCatalog,
  buildUniversityCatalog,
  buildProfileReadPayload,
  buildNotificationSettingsReadPayload,
  validateUsername,
  handleLogin,
  handleFindUsername,
  handleResetPassword,
  handleLogout,
  handleRequestPhoneVerificationCode,
  handleVerifyPhoneVerificationCode,
  handleRegister,
  handleDeleteMyAccount,
  handlePatchMyProfile,
  handlePatchMyRegion,
  handlePatchMyNotifications,
  handlePatchMyLiveSharing,
}) {
  if (pathname === '/api/auth/login' && method === 'POST') {
    await handleLogin(request, response);
    return true;
  }

  if (pathname === '/api/auth/find-username' && method === 'POST') {
    await handleFindUsername(request, response);
    return true;
  }

  if (pathname === '/api/auth/reset-password' && method === 'POST') {
    await handleResetPassword(request, response);
    return true;
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    await handleLogout(request, response);
    return true;
  }

  if (pathname === '/api/auth/check-username' && method === 'GET') {
    const username = validateUsername(url.searchParams.get('username') ?? '');
    sendJson(response, 200, await getAuthRepository().checkUsername(username));
    return true;
  }

  if (pathname === '/api/auth/phone/request-code' && method === 'POST') {
    await handleRequestPhoneVerificationCode(request, response);
    return true;
  }

  if (pathname === '/api/auth/phone/verify-code' && method === 'POST') {
    await handleVerifyPhoneVerificationCode(request, response);
    return true;
  }

  if (pathname === '/api/catalog/regions' && method === 'GET') {
    sendJson(response, 200, buildRegionCatalog());
    return true;
  }

  if (pathname === '/api/catalog/universities' && method === 'GET') {
    const store = loadStore();
    sendJson(response, 200, buildUniversityCatalog(store));
    return true;
  }

  if (pathname === '/api/notices/active' && method === 'GET') {
    sendJson(response, 200, getAdminRepository().getActiveNotices());
    return true;
  }

  if (pathname === '/api/auth/register' && method === 'POST') {
    await handleRegister(request, response);
    return true;
  }

  if (pathname === '/api/me/profile' && method === 'GET') {
    sendJson(response, 200, await buildProfileReadPayload(request));
    return true;
  }

  if (pathname === '/api/me/account' && method === 'DELETE') {
    await handleDeleteMyAccount(request, response);
    return true;
  }

  if (pathname === '/api/me/profile' && method === 'PATCH') {
    await handlePatchMyProfile(request, response);
    return true;
  }

  if (pathname === '/api/me/notifications' && method === 'GET') {
    sendJson(response, 200, await buildNotificationSettingsReadPayload(request));
    return true;
  }

  if (pathname === '/api/me/notifications' && method === 'PATCH') {
    await handlePatchMyNotifications(request, response);
    return true;
  }

  if (pathname === '/api/me/region' && method === 'PATCH') {
    await handlePatchMyRegion(request, response);
    return true;
  }

  if (pathname === '/api/me/live-sharing' && method === 'PATCH') {
    await handlePatchMyLiveSharing(request, response);
    return true;
  }

  return false;
}
