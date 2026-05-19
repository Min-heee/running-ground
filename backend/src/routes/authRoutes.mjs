export async function routeAuthRequest({
  method,
  pathname,
  request,
  response,
  url,
  sendJson,
  loadStore,
  mutateStore,
  getAdminRepository,
  getAuthRepository,
  getAccessToken,
  getPostgresFriendsRepository,
  getFriendsRepository,
  buildRegionCatalog,
  buildUniversityCatalog,
  buildProfileReadPayload,
  buildNotificationSettingsReadPayload,
  buildNotificationSettings,
  buildPhoneVerificationPayload,
  buildPhoneVerificationSuccessPayload,
  buildProfile,
  cleanupPhoneVerificationChallenges,
  createPhoneVerificationChallenge,
  createToken,
  ensurePhoneVerificationChallenges,
  hashPhoneVerificationCode,
  phoneVerificationService,
  requireUser,
  resolveRegionSelection,
  validateBoolean,
  validateNewPassword,
  validatePhoneNumber,
  validatePhoneVerificationCode,
  validatePhoneVerificationPurpose,
  validateRequiredString,
  validateUsername,
  normalizeOptionalString,
  parseJsonBody,
  PHONE_VERIFICATION_VERIFIED_TTL_MS,
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

  if (pathname === '/api/auth/phone/request-code' && method === 'POST') {
    await handleRequestPhoneVerificationCode({
      ApiError,
      buildPhoneVerificationPayload,
      cleanupPhoneVerificationChallenges,
      createPhoneVerificationChallenge,
      ensurePhoneVerificationChallenges,
      mutateStore,
      parseJsonBody,
      phoneVerificationService,
      request,
      response,
      sendJson,
      validatePhoneNumber,
      validatePhoneVerificationPurpose,
    });
    return true;
  }

  if (pathname === '/api/auth/phone/verify-code' && method === 'POST') {
    await handleVerifyPhoneVerificationCode({
      ApiError,
      buildPhoneVerificationSuccessPayload,
      cleanupPhoneVerificationChallenges,
      createToken,
      ensurePhoneVerificationChallenges,
      hashPhoneVerificationCode,
      mutateStore,
      parseJsonBody,
      PHONE_VERIFICATION_VERIFIED_TTL_MS,
      request,
      response,
      sendJson,
      validatePhoneVerificationCode,
      validatePhoneVerificationPurpose,
      validateRequiredString,
    });
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
    await handleRegister({
      ApiError,
      getAuthRepository,
      parseJsonBody,
      request,
      resolveRegionSelection,
      response,
      sendJson,
      validateNewPassword,
      validateRequiredString,
      validateUsername,
    });
    return true;
  }

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

  if (pathname === '/api/me/notifications' && method === 'GET') {
    sendJson(response, 200, await buildNotificationSettingsReadPayload(request));
    return true;
  }

  if (pathname === '/api/me/notifications' && method === 'PATCH') {
    await handlePatchMyNotifications({
      buildNotificationSettings,
      mutateStore,
      parseJsonBody,
      request,
      requireUser,
      response,
      sendJson,
      validateBoolean,
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

  if (pathname === '/api/me/live-sharing' && method === 'PATCH') {
    await handlePatchMyLiveSharing({
      getAccessToken,
      getFriendsRepository,
      getPostgresFriendsRepository,
      normalizeOptionalString,
      parseJsonBody,
      request,
      response,
      sendJson,
      validateBoolean,
    });
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

async function handleRequestPhoneVerificationCode({
  ApiError,
  buildPhoneVerificationPayload,
  cleanupPhoneVerificationChallenges,
  createPhoneVerificationChallenge,
  ensurePhoneVerificationChallenges,
  mutateStore,
  parseJsonBody,
  phoneVerificationService,
  request,
  response,
  sendJson,
  validatePhoneNumber,
  validatePhoneVerificationPurpose,
}) {
  const body = await parseJsonBody(request);
  const purpose = validatePhoneVerificationPurpose(body.purpose);
  const phone = validatePhoneNumber(body.phone);
  const now = new Date();

  let createdChallenge = null;
  let rawCode = '';

  mutateStore((store) => {
    cleanupPhoneVerificationChallenges(store, now);
    const challenges = ensurePhoneVerificationChallenges(store);
    const activeChallenge = challenges.find((entry) => (
      entry.purpose === purpose
      && entry.phone === phone
      && entry.status === 'pending'
      && Date.parse(entry.expiresAt) > now.getTime()
    ));

    if (activeChallenge) {
      const resendAvailableAtMs = Date.parse(activeChallenge.resendAvailableAt);

      if (Number.isFinite(resendAvailableAtMs) && resendAvailableAtMs > now.getTime()) {
        const remainingSeconds = Math.max(1, Math.ceil((resendAvailableAtMs - now.getTime()) / 1000));
        throw new ApiError(429, `인증번호를 너무 자주 요청하고 있어요. ${remainingSeconds}초 뒤에 다시 시도해주세요.`);
      }
    }

    const { challenge, code } = createPhoneVerificationChallenge({
      purpose,
      phone,
      now,
    });

    for (const existingChallenge of challenges) {
      if (existingChallenge.phone === phone && existingChallenge.purpose === purpose && existingChallenge.status === 'pending') {
        existingChallenge.status = 'superseded';
        existingChallenge.updatedAt = now.toISOString();
      }
    }

    challenges.push(challenge);
    createdChallenge = challenge;
    rawCode = code;
  });

  try {
    const providerResult = await phoneVerificationService.sendCode({
      phone,
      code: rawCode,
      purpose,
    });
    sendJson(response, 200, buildPhoneVerificationPayload(createdChallenge, providerResult));
  } catch (error) {
    mutateStore((store) => {
      cleanupPhoneVerificationChallenges(store);
      store.phoneVerificationChallenges = ensurePhoneVerificationChallenges(store)
        .filter((entry) => entry.id !== createdChallenge?.id);
    });
    throw new ApiError(502, error instanceof Error ? error.message : '인증번호 발송에 실패했어요.');
  }
}

async function handleVerifyPhoneVerificationCode({
  ApiError,
  buildPhoneVerificationSuccessPayload,
  cleanupPhoneVerificationChallenges,
  createToken,
  ensurePhoneVerificationChallenges,
  hashPhoneVerificationCode,
  mutateStore,
  parseJsonBody,
  PHONE_VERIFICATION_VERIFIED_TTL_MS,
  request,
  response,
  sendJson,
  validatePhoneVerificationCode,
  validatePhoneVerificationPurpose,
  validateRequiredString,
}) {
  const body = await parseJsonBody(request);
  const requestId = validateRequiredString(body.requestId, '인증 요청을 먼저 시작해주세요.');
  const purpose = validatePhoneVerificationPurpose(body.purpose);
  const code = validatePhoneVerificationCode(body.code);
  const now = new Date();
  let verifiedChallenge = null;

  mutateStore((store) => {
    cleanupPhoneVerificationChallenges(store, now);
    const challenge = ensurePhoneVerificationChallenges(store).find((entry) => entry.id === requestId && entry.purpose === purpose);

    if (!challenge) {
      throw new ApiError(404, '인증 요청을 찾을 수 없어요. 다시 인증번호를 요청해주세요.');
    }

    if (challenge.status === 'verified' && challenge.verifiedToken && challenge.registrationExpiresAt) {
      verifiedChallenge = challenge;
      return;
    }

    if (challenge.status !== 'pending') {
      throw new ApiError(400, '이미 만료되었거나 사용할 수 없는 인증 요청이에요. 다시 시도해주세요.');
    }

    const expiresAtMs = Date.parse(challenge.expiresAt);

    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) {
      challenge.status = 'expired';
      challenge.updatedAt = now.toISOString();
      throw new ApiError(400, '인증번호가 만료됐어요. 다시 요청해주세요.');
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      challenge.status = 'locked';
      challenge.updatedAt = now.toISOString();
      throw new ApiError(429, '인증 시도 횟수를 초과했어요. 새 인증번호를 다시 요청해주세요.');
    }

    if (challenge.codeHash !== hashPhoneVerificationCode(challenge.id, code)) {
      challenge.attempts += 1;
      challenge.updatedAt = now.toISOString();

      if (challenge.attempts >= challenge.maxAttempts) {
        challenge.status = 'locked';
        throw new ApiError(429, '인증 시도 횟수를 초과했어요. 새 인증번호를 다시 요청해주세요.');
      }

      throw new ApiError(400, '인증번호가 맞지 않아요.');
    }

    challenge.status = 'verified';
    challenge.verifiedAt = now.toISOString();
    challenge.registrationExpiresAt = new Date(now.getTime() + PHONE_VERIFICATION_VERIFIED_TTL_MS).toISOString();
    challenge.verifiedToken = createToken();
    challenge.updatedAt = now.toISOString();
    verifiedChallenge = challenge;
  });

  sendJson(response, 200, buildPhoneVerificationSuccessPayload(verifiedChallenge));
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

async function handleRegister({
  ApiError,
  getAuthRepository,
  parseJsonBody,
  request,
  resolveRegionSelection,
  response,
  sendJson,
  validateNewPassword,
  validateRequiredString,
  validateUsername,
}) {
  const body = await parseJsonBody(request);
  const username = validateUsername(body.username);
  const password = validateNewPassword(body.password);
  const name = typeof body.nickname === 'string' && body.nickname.trim()
    ? body.nickname.trim()
    : validateRequiredString(body.name, '닉네임을 입력해주세요.');
  const realName = typeof body.realName === 'string' && body.realName.trim()
    ? body.realName.trim()
    : validateRequiredString(body.name, '이름을 입력해주세요.');
  const phone = validateRequiredString(body.phone, '휴대폰 번호를 입력해주세요.').replace(/\D/g, '');
  const region = resolveRegionSelection(body.provinceName, body.cityName, body.districtName);
  const universityName = typeof body.universityName === 'string' ? body.universityName.trim() : '';
  const addressDetail = validateRequiredString(body.addressDetail, '상세 주소를 입력해주세요.');
  const birthDate = validateRequiredString(body.birthDate, '생년월일을 입력해주세요.');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new ApiError(400, '생년월일은 YYYY-MM-DD 형식으로 입력해주세요.');
  }

  if (phone.length < 10) {
    throw new ApiError(400, '휴대폰 번호를 정확히 입력해주세요.');
  }

  const result = await getAuthRepository().register({
    username,
    password,
    name,
    realName,
    phone,
    birthDate,
    region,
    universityName,
    addressDetail,
  });

  sendJson(response, 201, result);
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

async function handlePatchMyNotifications({
  buildNotificationSettings,
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  validateBoolean,
}) {
  const body = await parseJsonBody(request);

  const payload = mutateStore((store) => {
    const user = requireUser(store, request);
    user.notificationSettings = {
      friendAlerts: validateBoolean(body.friendAlerts, '친구 알림 설정값이 올바르지 않아.'),
      districtAlerts: validateBoolean(body.districtAlerts, '지역 알림 설정값이 올바르지 않아.'),
      marketAlerts: validateBoolean(body.marketAlerts, '마켓 알림 설정값이 올바르지 않아.'),
      matchReminders: validateBoolean(body.matchReminders, '매치 알림 설정값이 올바르지 않아.'),
    };

    return buildNotificationSettings(user);
  });

  sendJson(response, 200, payload);
}

async function handlePatchMyLiveSharing({
  getAccessToken,
  getFriendsRepository,
  getPostgresFriendsRepository,
  normalizeOptionalString,
  parseJsonBody,
  request,
  response,
  sendJson,
  validateBoolean,
}) {
  const body = await parseJsonBody(request);
  const token = getAccessToken(request);
  const enabled = validateBoolean(body.enabled, '위치 공유 설정값이 올바르지 않아.');
  const status = ['idle', 'paused', 'running'].includes(body.status)
    ? body.status
    : 'idle';
  const locationLabel = normalizeOptionalString(body.locationLabel);
  const postgresRepository = getPostgresFriendsRepository();
  const repository = postgresRepository ?? getFriendsRepository();
  const payload = await repository.updateLiveSharing({
    token,
    enabled,
    status,
    locationLabel,
  });

  sendJson(response, 200, payload);
}
