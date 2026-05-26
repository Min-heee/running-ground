export async function routeMeProfileRequest({
  method,
  pathname,
  request,
  response,
  sendJson,
  mutateStore,
  getAuthRepository,
  getAccessToken,
  buildProfileReadPayload,
  buildProfile,
  requireUser,
  resolveRegionSelection,
  validateRequiredString,
  parseJsonBody,
}) {
  if (pathname === '/api/me/profile' && method === 'GET') {
    sendJson(response, 200, await buildProfileReadPayload(request));
    return true;
  }

  if (pathname === '/api/me/account' && method === 'DELETE') {
    await handleDeleteMyAccount({
      getAccessToken,
      getAuthRepository,
      request,
      response,
      sendJson,
    });
    return true;
  }

  if (pathname === '/api/me/profile' && method === 'PATCH') {
    await handlePatchMyProfile({
      buildProfile,
      mutateStore,
      parseJsonBody,
      request,
      requireUser,
      response,
      sendJson,
      validateRequiredString,
    });
    return true;
  }

  if (pathname === '/api/me/region' && method === 'PATCH') {
    await handlePatchMyRegion({
      buildProfile,
      mutateStore,
      parseJsonBody,
      request,
      requireUser,
      resolveRegionSelection,
      response,
      sendJson,
    });
    return true;
  }

  return false;
}

async function handleDeleteMyAccount({
  getAccessToken,
  getAuthRepository,
  request,
  response,
  sendJson,
}) {
  const payload = await getAuthRepository().deleteAccount({
    token: getAccessToken(request),
  });

  sendJson(response, 200, payload);
}

async function handlePatchMyProfile({
  buildProfile,
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  validateRequiredString,
}) {
  const body = await parseJsonBody(request);

  const payload = mutateStore((store) => {
    const user = requireUser(store, request);
    user.name = validateRequiredString(body.name, '닉네임을 입력해줘.');
    user.universityName = typeof body.universityName === 'string' && body.universityName.trim()
      ? body.universityName.trim()
      : undefined;
    return buildProfile(store, user);
  });

  sendJson(response, 200, payload);
}

async function handlePatchMyRegion({
  buildProfile,
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  resolveRegionSelection,
  response,
  sendJson,
}) {
  const body = await parseJsonBody(request);

  const payload = mutateStore((store) => {
    const user = requireUser(store, request);
    const region = resolveRegionSelection(body.provinceName, body.cityName, body.districtName);
    user.provinceName = region.provinceName;
    user.cityName = region.cityName;
    user.districtName = region.districtName;
    return buildProfile(store, user);
  });

  sendJson(response, 200, payload);
}
