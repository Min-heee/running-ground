import {
  createNowIso,
  LIVE_RUN_SHARE_STALE_MS,
  normalizeLiveShareLabel,
} from './postgresFriendsHelpers.mjs';

export function sortFriendPair(leftUserId, rightUserId) {
  return leftUserId < rightUserId ? [leftUserId, rightUserId] : [rightUserId, leftUserId];
}

export function getRunForUser(runs, runId, createError) {
  if (!runs.length) {
    throw createError(404, '러닝 기록이 없어.');
  }

  if (!runId) {
    return runs[0];
  }

  const run = runs.find((entry) => entry.id === runId);

  if (!run) {
    throw createError(404, '러닝 기록을 찾을 수 없어.');
  }

  return run;
}

export function buildLiveRunSharePresentation(liveShare, nowIso = createNowIso) {
  if (!liveShare || liveShare.enabled !== true || liveShare.status !== 'running') {
    return {
      isRunningNow: false,
      liveLocationLabel: undefined,
    };
  }

  const updatedAtMs = Date.parse(liveShare.updatedAt ?? '');
  const nowMs = Date.parse(nowIso());
  const isFresh = Number.isFinite(updatedAtMs) && Number.isFinite(nowMs)
    ? nowMs - updatedAtMs <= LIVE_RUN_SHARE_STALE_MS
    : true;

  if (!isFresh) {
    return {
      isRunningNow: false,
      liveLocationLabel: undefined,
    };
  }

  const liveLocationLabel = normalizeLiveShareLabel(liveShare.locationLabel);

  return {
    isRunningNow: true,
    liveLocationLabel: liveLocationLabel || undefined,
  };
}

export function buildFriendRank(user, rank, metrics, liveShare, nowIso = createNowIso) {
  const liveSharePresentation = buildLiveRunSharePresentation(liveShare, nowIso);

  return {
    id: user.id,
    rank,
    name: user.name,
    tag: user.publicTag,
    // Competitive leaderboard: rank by AND show the competitive weekly distance
    // (imports excluded) so the displayed number agrees with the sort key.
    distanceKm: metrics.competitiveWeekDistanceKm,
    points: metrics.currentWeekPoints,
    // Real KST-anchored 오늘/이번 달 aggregates — the client's window tabs
    // display these verbatim (it used to fabricate them from the week values).
    todayDistanceKm: metrics.competitiveTodayDistanceKm ?? 0,
    todayPoints: metrics.todayPoints ?? 0,
    monthDistanceKm: metrics.competitiveMonthDistanceKm ?? 0,
    monthPoints: metrics.currentMonthPoints ?? 0,
    ...(liveSharePresentation.isRunningNow ? { isRunningNow: true } : {}),
    ...(liveSharePresentation.liveLocationLabel ? { liveLocationLabel: liveSharePresentation.liveLocationLabel } : {}),
  };
}

export function compareFriendRank(leftUser, rightUser, metricsByUserId) {
  const leftMetrics = metricsByUserId.get(leftUser.id);
  const rightMetrics = metricsByUserId.get(rightUser.id);
  const leftDistanceKm = leftMetrics?.competitiveWeekDistanceKm ?? 0;
  const rightDistanceKm = rightMetrics?.competitiveWeekDistanceKm ?? 0;

  if (rightDistanceKm !== leftDistanceKm) {
    return rightDistanceKm - leftDistanceKm;
  }

  const leftPoints = leftMetrics?.currentWeekPoints ?? 0;
  const rightPoints = rightMetrics?.currentWeekPoints ?? 0;

  if (rightPoints !== leftPoints) {
    return rightPoints - leftPoints;
  }

  return leftUser.name.localeCompare(rightUser.name, 'ko');
}

export function buildMetricsByUserId(runsByUserId, userIds, buildUserMetrics) {
  return new Map(userIds.map((userId) => [
    userId,
    buildUserMetrics(runsByUserId.get(userId) ?? []),
  ]));
}
