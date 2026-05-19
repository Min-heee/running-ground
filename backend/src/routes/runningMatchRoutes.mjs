export async function routeRunningMatchRequest({
  method,
  pathname,
  request,
  response,
  sendJson,
  parseJsonBody,
  mutateStore,
  loadStore,
  requireUser,
  validateRequiredString,
  validateDistanceKm,
  validateNonNegativeInteger,
  validateDuelMatchDistanceKm,
  validateMatchMode,
  validateMatchRoomStartMode,
  validateMatchSlotInput,
  validateOptionalUserIdArray,
  validatePace,
  buildDuelMatchResponse,
  buildGroupMatchResponse,
  buildMatchDemandSummaryResponse,
  buildRunningMatchStatusResponse,
  buildUpcomingRunningMatchesReadPayload,
  acceptRunningMatch,
  acknowledgeRunningMatchRoomCountdown,
  buildRunningMatchRoomResponse,
  cancelRunningMatch,
  cleanupStaleRunningMatchRoomState,
  createRunningMatchRoom,
  findRunningMatchRoomForUser,
  findRunningMatchRoomInviteInboxForUser,
  joinRunningMatchRoom,
  leaveRunningMatch,
  leaveRunningMatchRoom,
  startRunningMatchRoom,
  updateRunningMatchProgress,
  updateRunningMatchRoom,
  updateRunningMatchRoomReady,
}) {
  if (pathname === '/api/running/matches/duel' && method === 'POST') {
    await handleRequestDuelMatch({
      buildDuelMatchResponse,
      mutateStore,
      parseJsonBody,
      request,
      requireUser,
      response,
      sendJson,
      validateDuelMatchDistanceKm,
      validateMatchSlotInput,
    });
    return true;
  }

  if (pathname === '/api/running/matches/group' && method === 'POST') {
    await handleRequestGroupMatch({
      buildGroupMatchResponse,
      mutateStore,
      parseJsonBody,
      request,
      requireUser,
      response,
      sendJson,
      validateDuelMatchDistanceKm,
      validateMatchSlotInput,
    });
    return true;
  }

  if (pathname === '/api/running/matches/summary' && method === 'POST') {
    await handleFetchMatchDemandSummary({
      buildMatchDemandSummaryResponse,
      loadStore,
      parseJsonBody,
      request,
      requireUser,
      response,
      sendJson,
      validateDuelMatchDistanceKm,
      validateMatchMode,
      validateMatchSlotInput,
    });
    return true;
  }

  if (pathname === '/api/running/matches/status' && method === 'POST') {
    await handleFetchRunningMatchStatus({
      buildRunningMatchStatusResponse,
      mutateStore,
      parseJsonBody,
      request,
      requireUser,
      response,
      sendJson,
      validateDuelMatchDistanceKm,
      validateMatchMode,
      validateMatchSlotInput,
    });
    return true;
  }

  if (pathname === '/api/running/matches/upcoming' && method === 'GET') {
    sendJson(response, 200, await buildUpcomingRunningMatchesReadPayload(request));
    return true;
  }

  if (pathname === '/api/running/matches/accept' && method === 'POST') {
    await handleAcceptRunningMatch({
      acceptRunningMatch,
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

  if (pathname === '/api/running/matches/cancel' && method === 'POST') {
    await handleCancelRunningMatch({
      cancelRunningMatch,
      mutateStore,
      parseJsonBody,
      request,
      requireUser,
      response,
      sendJson,
      validateDuelMatchDistanceKm,
      validateMatchMode,
      validateMatchSlotInput,
    });
    return true;
  }

  if (pathname === '/api/running/matches/leave' && method === 'POST') {
    await handleLeaveRunningMatch({
      leaveRunningMatch,
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

  if (pathname === '/api/running/matches/progress' && method === 'POST') {
    await handleUpdateRunningMatchProgress({
      mutateStore,
      parseJsonBody,
      request,
      requireUser,
      response,
      sendJson,
      updateRunningMatchProgress,
      validateDistanceKm,
      validateNonNegativeInteger,
      validatePace,
      validateRequiredString,
    });
    return true;
  }

  if (pathname === '/api/running/rooms/my' && method === 'GET') {
    handleFetchMyRunningMatchRoom({
      buildRunningMatchRoomResponse,
      findRunningMatchRoomForUser,
      mutateStore,
      request,
      requireUser,
      response,
      sendJson,
    });
    return true;
  }

  if (pathname === '/api/running/rooms/invite-inbox' && method === 'GET') {
    handleFetchRunningMatchRoomInviteInbox({
      buildRunningMatchRoomResponse,
      findRunningMatchRoomInviteInboxForUser,
      mutateStore,
      request,
      requireUser,
      response,
      sendJson,
    });
    return true;
  }

  if (pathname === '/api/running/rooms' && method === 'POST') {
    await handleCreateRunningMatchRoom({
      createRunningMatchRoom,
      mutateStore,
      parseJsonBody,
      request,
      requireUser,
      response,
      sendJson,
      validateDuelMatchDistanceKm,
      validateMatchMode,
      validateMatchRoomStartMode,
      validateOptionalUserIdArray,
    });
    return true;
  }

  if (pathname === '/api/running/rooms/join' && method === 'POST') {
    await handleJoinRunningMatchRoom({
      joinRunningMatchRoom,
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

  if (pathname === '/api/running/rooms/update' && method === 'POST') {
    await handleUpdateRunningMatchRoom({
      mutateStore,
      parseJsonBody,
      request,
      requireUser,
      response,
      sendJson,
      updateRunningMatchRoom,
      validateDuelMatchDistanceKm,
      validateMatchRoomStartMode,
      validateOptionalUserIdArray,
      validateRequiredString,
    });
    return true;
  }

  if (pathname === '/api/running/rooms/ready' && method === 'POST') {
    await handleUpdateRunningMatchRoomReady({
      mutateStore,
      parseJsonBody,
      request,
      requireUser,
      response,
      sendJson,
      updateRunningMatchRoomReady,
      validateRequiredString,
    });
    return true;
  }

  if (pathname === '/api/running/rooms/countdown-ready' && method === 'POST') {
    await handleAcknowledgeRunningMatchRoomCountdown({
      acknowledgeRunningMatchRoomCountdown,
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

  if (pathname === '/api/running/rooms/start' && method === 'POST') {
    await handleStartRunningMatchRoom({
      mutateStore,
      parseJsonBody,
      request,
      requireUser,
      response,
      sendJson,
      startRunningMatchRoom,
      validateRequiredString,
    });
    return true;
  }

  if (pathname === '/api/running/rooms/leave' && method === 'POST') {
    await handleLeaveRunningMatchRoom({
      leaveRunningMatchRoom,
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

  if (pathname === '/api/running/rooms/cleanup-stale' && method === 'POST') {
    await handleCleanupStaleRunningMatchRoomState({
      cleanupStaleRunningMatchRoomState,
      mutateStore,
      request,
      requireUser,
      response,
      sendJson,
    });
    return true;
  }

  return false;
}

async function handleRequestDuelMatch({
  buildDuelMatchResponse,
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  validateDuelMatchDistanceKm,
  validateMatchSlotInput,
}) {
  const body = await parseJsonBody(request);
  const distanceKm = validateDuelMatchDistanceKm(body.distanceKm);
  const testMode = body.testMode === true;
  const slotStartAt = testMode
    ? (typeof body.slotStartAt === 'string' && body.slotStartAt.trim() ? body.slotStartAt.trim() : new Date().toISOString())
    : validateMatchSlotInput(body.slotStartAt);
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return buildDuelMatchResponse(store, currentUser, {
      distanceKm,
      slotStartAt,
      testMode,
    });
  });

  sendJson(response, 200, payload);
}

async function handleRequestGroupMatch({
  buildGroupMatchResponse,
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  validateDuelMatchDistanceKm,
  validateMatchSlotInput,
}) {
  const body = await parseJsonBody(request);
  const distanceKm = validateDuelMatchDistanceKm(body.distanceKm);
  const testMode = body.testMode === true;
  const slotStartAt = testMode
    ? (typeof body.slotStartAt === 'string' && body.slotStartAt.trim() ? body.slotStartAt.trim() : new Date().toISOString())
    : validateMatchSlotInput(body.slotStartAt);
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return buildGroupMatchResponse(store, currentUser, {
      distanceKm,
      slotStartAt,
      testMode,
    });
  });

  sendJson(response, 200, payload);
}

async function handleFetchMatchDemandSummary({
  buildMatchDemandSummaryResponse,
  loadStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  validateDuelMatchDistanceKm,
  validateMatchMode,
  validateMatchSlotInput,
}) {
  const body = await parseJsonBody(request);
  const store = loadStore();
  const currentUser = requireUser(store, request);
  const payload = buildMatchDemandSummaryResponse(store, currentUser, {
    mode: validateMatchMode(body.mode),
    distanceKm: validateDuelMatchDistanceKm(body.distanceKm),
    slotStartAt: validateMatchSlotInput(body.slotStartAt),
  });

  sendJson(response, 200, payload);
}

async function handleFetchRunningMatchStatus({
  buildRunningMatchStatusResponse,
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  validateDuelMatchDistanceKm,
  validateMatchMode,
  validateMatchSlotInput,
}) {
  const body = await parseJsonBody(request);
  const mode = validateMatchMode(body.mode);
  const distanceKm = validateDuelMatchDistanceKm(body.distanceKm);
  const testMode = body.testMode === true;
  const matchId = typeof body.matchId === 'string' && body.matchId.trim() ? body.matchId.trim() : undefined;
  const slotStartAt = testMode
    ? (typeof body.slotStartAt === 'string' && body.slotStartAt.trim() ? body.slotStartAt.trim() : new Date().toISOString())
    : validateMatchSlotInput(body.slotStartAt);
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return buildRunningMatchStatusResponse(store, currentUser, {
      mode,
      distanceKm,
      slotStartAt,
      testMode,
      matchId,
    });
  });

  sendJson(response, 200, payload);
}

async function handleAcceptRunningMatch({
  acceptRunningMatch,
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  validateRequiredString,
}) {
  const body = await parseJsonBody(request);
  const matchId = validateRequiredString(body.matchId, '수락할 매치 아이디가 필요해.');
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return acceptRunningMatch(store, currentUser, matchId);
  });

  sendJson(response, 200, payload);
}

async function handleCancelRunningMatch({
  cancelRunningMatch,
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  validateDuelMatchDistanceKm,
  validateMatchMode,
  validateMatchSlotInput,
}) {
  const body = await parseJsonBody(request);
  const mode = validateMatchMode(body.mode);
  const distanceKm = validateDuelMatchDistanceKm(body.distanceKm);
  const testMode = body.testMode === true;
  const slotStartAt = testMode
    ? (typeof body.slotStartAt === 'string' && body.slotStartAt.trim() ? body.slotStartAt.trim() : new Date().toISOString())
    : validateMatchSlotInput(body.slotStartAt);
  const matchId = typeof body.matchId === 'string' && body.matchId.trim() ? body.matchId.trim() : '';
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return cancelRunningMatch(store, currentUser, {
      mode,
      distanceKm,
      slotStartAt,
      testMode,
      ...(matchId ? { matchId } : {}),
    });
  });

  sendJson(response, 200, payload);
}

async function handleLeaveRunningMatch({
  leaveRunningMatch,
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  validateRequiredString,
}) {
  const body = await parseJsonBody(request);
  const matchId = validateRequiredString(body.matchId, '이탈할 매치 아이디가 필요해.');
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return leaveRunningMatch(store, currentUser, { matchId });
  });

  sendJson(response, 200, payload);
}

async function handleUpdateRunningMatchProgress({
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  updateRunningMatchProgress,
  validateDistanceKm,
  validateNonNegativeInteger,
  validatePace,
  validateRequiredString,
}) {
  const body = await parseJsonBody(request);
  const matchId = validateRequiredString(body.matchId, '진행 상태를 반영할 매치 아이디가 필요해.');
  const distanceKm = validateDistanceKm(body.distanceKm, '러닝 거리를 입력해줘.');
  const elapsedSeconds = validateNonNegativeInteger(body.elapsedSeconds, '러닝 시간은 0초 이상이어야 해.');
  const currentPace = String(body.currentPace ?? '').trim() === '--:--/km'
    ? '--:--/km'
    : validatePace(body.currentPace, '현재 페이스가 올바르지 않아.');
  const status = ['running', 'background', 'paused', 'finished'].includes(body.status)
    ? body.status
    : 'running';
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return updateRunningMatchProgress(store, currentUser, {
      matchId,
      distanceKm,
      elapsedSeconds,
      currentPace,
      status,
    });
  });

  sendJson(response, 200, payload);
}

function handleFetchMyRunningMatchRoom({
  buildRunningMatchRoomResponse,
  findRunningMatchRoomForUser,
  mutateStore,
  request,
  requireUser,
  response,
  sendJson,
}) {
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    const room = findRunningMatchRoomForUser(store, currentUser.id);
    return buildRunningMatchRoomResponse(store, currentUser, room);
  });

  sendJson(response, 200, payload);
}

function handleFetchRunningMatchRoomInviteInbox({
  buildRunningMatchRoomResponse,
  findRunningMatchRoomInviteInboxForUser,
  mutateStore,
  request,
  requireUser,
  response,
  sendJson,
}) {
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    const room = findRunningMatchRoomInviteInboxForUser(store, currentUser);
    return buildRunningMatchRoomResponse(store, currentUser, room);
  });

  sendJson(response, 200, payload);
}

async function handleCreateRunningMatchRoom({
  createRunningMatchRoom,
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  validateDuelMatchDistanceKm,
  validateMatchMode,
  validateMatchRoomStartMode,
  validateOptionalUserIdArray,
}) {
  const body = await parseJsonBody(request);
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return createRunningMatchRoom(store, currentUser, {
      mode: validateMatchMode(body.mode),
      distanceKm: validateDuelMatchDistanceKm(body.distanceKm),
      startMode: validateMatchRoomStartMode(body.startMode),
      slotStartAt: body.slotStartAt,
      maxParticipants: body.maxParticipants,
      invitedFriendIds: validateOptionalUserIdArray(body.invitedFriendIds, '초대할 친구 목록이 올바르지 않아.'),
    });
  });

  sendJson(response, 201, payload);
}

async function handleJoinRunningMatchRoom({
  joinRunningMatchRoom,
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
    const currentUser = requireUser(store, request);
    return joinRunningMatchRoom(store, currentUser, {
      inviteToken: validateRequiredString(body.inviteToken, '방 초대 코드를 입력해줘.'),
    });
  });

  sendJson(response, 200, payload);
}

async function handleStartRunningMatchRoom({
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  startRunningMatchRoom,
  validateRequiredString,
}) {
  const body = await parseJsonBody(request);
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return startRunningMatchRoom(store, currentUser, {
      roomId: validateRequiredString(body.roomId, '시작할 방 아이디가 필요해.'),
    });
  });

  sendJson(response, 200, payload);
}

async function handleUpdateRunningMatchRoom({
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  updateRunningMatchRoom,
  validateDuelMatchDistanceKm,
  validateMatchRoomStartMode,
  validateOptionalUserIdArray,
  validateRequiredString,
}) {
  const body = await parseJsonBody(request);
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return updateRunningMatchRoom(store, currentUser, {
      roomId: validateRequiredString(body.roomId, '설정할 방 아이디가 필요해.'),
      distanceKm: validateDuelMatchDistanceKm(body.distanceKm),
      startMode: validateMatchRoomStartMode(body.startMode),
      slotStartAt: body.slotStartAt,
      maxParticipants: body.maxParticipants,
      invitedFriendIds: validateOptionalUserIdArray(body.invitedFriendIds, '초대할 친구 목록이 올바르지 않아.'),
    });
  });

  sendJson(response, 200, payload);
}

async function handleUpdateRunningMatchRoomReady({
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  updateRunningMatchRoomReady,
  validateRequiredString,
}) {
  const body = await parseJsonBody(request);
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return updateRunningMatchRoomReady(store, currentUser, {
      roomId: validateRequiredString(body.roomId, '준비 상태를 바꿀 방 아이디가 필요해.'),
      ready: body.ready === true,
    });
  });

  sendJson(response, 200, payload);
}

async function handleAcknowledgeRunningMatchRoomCountdown({
  acknowledgeRunningMatchRoomCountdown,
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
    const currentUser = requireUser(store, request);
    return acknowledgeRunningMatchRoomCountdown(store, currentUser, {
      roomId: validateRequiredString(body.roomId, '카운트다운 준비를 반영할 방 아이디가 필요해.'),
    });
  });

  sendJson(response, 200, payload);
}

async function handleLeaveRunningMatchRoom({
  leaveRunningMatchRoom,
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
    const currentUser = requireUser(store, request);
    return leaveRunningMatchRoom(store, currentUser, {
      roomId: validateRequiredString(body.roomId, '나갈 방 아이디가 필요해.'),
    });
  });

  sendJson(response, 200, payload);
}

async function handleCleanupStaleRunningMatchRoomState({
  cleanupStaleRunningMatchRoomState,
  mutateStore,
  request,
  requireUser,
  response,
  sendJson,
}) {
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return cleanupStaleRunningMatchRoomState(store, currentUser);
  });

  sendJson(response, 200, payload);
}
