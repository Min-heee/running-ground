export async function routeAuthLoginRequest({
  method,
  pathname,
  request,
  response,
  url,
  sendJson,
  getAuthRepository,
  getAccessToken,
  validateNewPassword,
  validateRequiredString,
  validateUsername,
  parseJsonBody,
  ApiError,
}) {
  if (pathname === '/api/auth/login' && method === 'POST') {
    await handleLogin({
      getAuthRepository,
      parseJsonBody,
      request,
      response,
      sendJson,
      validateRequiredString,
    });
    return true;
  }

  if (pathname === '/api/auth/find-username' && method === 'POST') {
    await handleFindUsername({
      ApiError,
      getAuthRepository,
      parseJsonBody,
      request,
      response,
      sendJson,
      validateRequiredString,
    });
    return true;
  }

  if (pathname === '/api/auth/reset-password' && method === 'POST') {
    await handleResetPassword({
      ApiError,
      getAuthRepository,
      parseJsonBody,
      request,
      response,
      sendJson,
      validateNewPassword,
      validateRequiredString,
      validateUsername,
    });
    return true;
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    await handleLogout({
      getAccessToken,
      getAuthRepository,
      request,
      response,
      sendJson,
    });
    return true;
  }

  if (pathname === '/api/auth/check-username' && method === 'GET') {
    const username = validateUsername(url.searchParams.get('username') ?? '');
    sendJson(response, 200, await getAuthRepository().checkUsername(username));
    return true;
  }

  return false;
}

async function handleLogin({
  getAuthRepository,
  parseJsonBody,
  request,
  response,
  sendJson,
  validateRequiredString,
}) {
  const body = await parseJsonBody(request);
  const username = validateRequiredString(body.username, '아이디를 입력해주세요.').toLowerCase();
  const password = validateRequiredString(body.password, '비밀번호를 입력해주세요.');
  const result = await getAuthRepository().login({ username, password });

  sendJson(response, 200, result);
}

async function handleFindUsername({
  ApiError,
  getAuthRepository,
  parseJsonBody,
  request,
  response,
  sendJson,
  validateRequiredString,
}) {
  const body = await parseJsonBody(request);
  const realName = validateRequiredString(body.realName, '이름을 입력해주세요.');
  const phone = validateRequiredString(body.phone, '휴대폰 번호를 입력해주세요.').replace(/\D/g, '');
  const birthDate = validateRequiredString(body.birthDate, '생년월일을 입력해주세요.');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new ApiError(400, '생년월일은 YYYY-MM-DD 형식으로 입력해주세요.');
  }

  if (phone.length < 10) {
    throw new ApiError(400, '휴대폰 번호를 정확히 입력해주세요.');
  }

  const result = await getAuthRepository().findUsername({
    realName,
    phone,
    birthDate,
  });

  sendJson(response, 200, result);
}

async function handleResetPassword({
  ApiError,
  getAuthRepository,
  parseJsonBody,
  request,
  response,
  sendJson,
  validateNewPassword,
  validateRequiredString,
  validateUsername,
}) {
  const body = await parseJsonBody(request);
  const username = validateUsername(body.username);
  const realName = validateRequiredString(body.realName, '이름을 입력해주세요.');
  const phone = validateRequiredString(body.phone, '휴대폰 번호를 입력해주세요.').replace(/\D/g, '');
  const birthDate = validateRequiredString(body.birthDate, '생년월일을 입력해주세요.');
  const newPassword = validateNewPassword(body.newPassword);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new ApiError(400, '생년월일은 YYYY-MM-DD 형식으로 입력해주세요.');
  }

  if (phone.length < 10) {
    throw new ApiError(400, '휴대폰 번호를 정확히 입력해주세요.');
  }

  const result = await getAuthRepository().resetPassword({
    username,
    realName,
    phone,
    birthDate,
    newPassword,
  });

  sendJson(response, 200, result);
}

async function handleLogout({
  getAccessToken,
  getAuthRepository,
  request,
  response,
  sendJson,
}) {
  const payload = await getAuthRepository().logout({
    token: getAccessToken(request),
  });

  sendJson(response, 200, payload);
}
