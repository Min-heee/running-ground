export async function routeRunningMatchRoomRoutes(deps) {
  const { method, pathname } = deps;

  if (pathname === '/api/running/rooms/my' && method === 'GET') {
    await handleFetchMyRunningMatchRoom(deps);
    return true;
  }

  if (pathname === '/api/running/rooms/invite-inbox' && method === 'GET') {
    await handleFetchRunningMatchRoomInviteInbox(deps);
    return true;
  }

  if (pathname === '/api/running/rooms' && method === 'POST') {
    await handleCreateRunningMatchRoom(deps);
    return true;
  }

  if (pathname === '/api/running/rooms/join' && method === 'POST') {
    await handleJoinRunningMatchRoom(deps);
    return true;
  }

  if (pathname === '/api/running/rooms/update' && method === 'POST') {
    await handleUpdateRunningMatchRoom(deps);
    return true;
  }

  if (pathname === '/api/running/rooms/ready' && method === 'POST') {
    await handleUpdateRunningMatchRoomReady(deps);
    return true;
  }

  if (pathname === '/api/running/rooms/countdown-ready' && method === 'POST') {
    await handleAcknowledgeRunningMatchRoomCountdown(deps);
    return true;
  }

  if (pathname === '/api/running/rooms/start' && method === 'POST') {
    await handleStartRunningMatchRoom(deps);
    return true;
  }

  if (pathname === '/api/running/rooms/leave' && method === 'POST') {
    await handleLeaveRunningMatchRoom(deps);
    return true;
  }

  if (pathname === '/api/running/rooms/cleanup-stale' && method === 'POST') {
    await handleCleanupStaleRunningMatchRoomState(deps);
    return true;
  }

  if (pathname === '/api/running/rooms/force-reset' && method === 'POST') {
    await handleForceResetRunningMatchState(deps);
    return true;
  }

  return false;
}

async function handleFetchMyRunningMatchRoom({
  buildRunningMatchRoomResponse,
  findRunningMatchRoomForUser,
  mutateStore,
  request,
  requireUser,
  response,
  sendJson,
}) {
  const payload = await mutateStore((store) => {
    const currentUser = requireUser(store, request);
    const room = findRunningMatchRoomForUser(store, currentUser.id);
    return buildRunningMatchRoomResponse(store, currentUser, room);
  });

  sendJson(response, 200, payload);
}

async function handleFetchRunningMatchRoomInviteInbox({
  buildRunningMatchRoomResponse,
  findRunningMatchRoomInviteInboxForUser,
  mutateStore,
  request,
  requireUser,
  response,
  sendJson,
}) {
  const payload = await mutateStore((store) => {
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
  const payload = await mutateStore((store) => {
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
  const payload = await mutateStore((store) => {
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
  const payload = await mutateStore((store) => {
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
  const payload = await mutateStore((store) => {
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
  const payload = await mutateStore((store) => {
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
  const payload = await mutateStore((store) => {
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
  const payload = await mutateStore((store) => {
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
  const payload = await mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return cleanupStaleRunningMatchRoomState(store, currentUser);
  });

  sendJson(response, 200, payload);
}

async function handleForceResetRunningMatchState({
  forceResetRunningMatchStateForUser,
  mutateStore,
  request,
  requireUser,
  response,
  sendJson,
}) {
  const payload = await mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return forceResetRunningMatchStateForUser(store, currentUser);
  });

  sendJson(response, 200, payload);
}
