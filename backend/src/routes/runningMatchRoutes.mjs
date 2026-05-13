export async function routeRunningMatchRequest({
  method,
  pathname,
  request,
  response,
  sendJson,
  buildUpcomingRunningMatchesReadPayload,
  handleRequestDuelMatch,
  handleRequestGroupMatch,
  handleFetchMatchDemandSummary,
  handleFetchRunningMatchStatus,
  handleAcceptRunningMatch,
  handleCancelRunningMatch,
  handleLeaveRunningMatch,
  handleUpdateRunningMatchProgress,
  handleFetchMyRunningMatchRoom,
  handleCreateRunningMatchRoom,
  handleJoinRunningMatchRoom,
  handleUpdateRunningMatchRoom,
  handleUpdateRunningMatchRoomReady,
  handleAcknowledgeRunningMatchRoomCountdown,
  handleStartRunningMatchRoom,
  handleLeaveRunningMatchRoom,
  handleCleanupStaleRunningMatchRoomState,
}) {
  if (pathname === '/api/running/matches/duel' && method === 'POST') {
    await handleRequestDuelMatch(request, response);
    return true;
  }

  if (pathname === '/api/running/matches/group' && method === 'POST') {
    await handleRequestGroupMatch(request, response);
    return true;
  }

  if (pathname === '/api/running/matches/summary' && method === 'POST') {
    await handleFetchMatchDemandSummary(request, response);
    return true;
  }

  if (pathname === '/api/running/matches/status' && method === 'POST') {
    await handleFetchRunningMatchStatus(request, response);
    return true;
  }

  if (pathname === '/api/running/matches/upcoming' && method === 'GET') {
    sendJson(response, 200, await buildUpcomingRunningMatchesReadPayload(request));
    return true;
  }

  if (pathname === '/api/running/matches/accept' && method === 'POST') {
    await handleAcceptRunningMatch(request, response);
    return true;
  }

  if (pathname === '/api/running/matches/cancel' && method === 'POST') {
    await handleCancelRunningMatch(request, response);
    return true;
  }

  if (pathname === '/api/running/matches/leave' && method === 'POST') {
    await handleLeaveRunningMatch(request, response);
    return true;
  }

  if (pathname === '/api/running/matches/progress' && method === 'POST') {
    await handleUpdateRunningMatchProgress(request, response);
    return true;
  }

  if (pathname === '/api/running/rooms/my' && method === 'GET') {
    handleFetchMyRunningMatchRoom(request, response);
    return true;
  }

  if (pathname === '/api/running/rooms' && method === 'POST') {
    await handleCreateRunningMatchRoom(request, response);
    return true;
  }

  if (pathname === '/api/running/rooms/join' && method === 'POST') {
    await handleJoinRunningMatchRoom(request, response);
    return true;
  }

  if (pathname === '/api/running/rooms/update' && method === 'POST') {
    await handleUpdateRunningMatchRoom(request, response);
    return true;
  }

  if (pathname === '/api/running/rooms/ready' && method === 'POST') {
    await handleUpdateRunningMatchRoomReady(request, response);
    return true;
  }

  if (pathname === '/api/running/rooms/countdown-ready' && method === 'POST') {
    await handleAcknowledgeRunningMatchRoomCountdown(request, response);
    return true;
  }

  if (pathname === '/api/running/rooms/start' && method === 'POST') {
    await handleStartRunningMatchRoom(request, response);
    return true;
  }

  if (pathname === '/api/running/rooms/leave' && method === 'POST') {
    await handleLeaveRunningMatchRoom(request, response);
    return true;
  }

  if (pathname === '/api/running/rooms/cleanup-stale' && method === 'POST') {
    await handleCleanupStaleRunningMatchRoomState(request, response);
    return true;
  }

  return false;
}
