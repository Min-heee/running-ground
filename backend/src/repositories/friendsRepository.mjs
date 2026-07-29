import { attachStoredRunRoute } from '../lib/runHelpers.mjs';
import { RANK_TIERS, resolveRankTier } from '../lib/rankSystem.mjs';
import { appendUserNotification } from '../lib/userNotifications.mjs';

function getFriendIds(store, userId) {
  return (store.friendships ?? []).flatMap((friendship) => {
    if (friendship.userIds[0] === userId) {
      return [friendship.userIds[1]];
    }

    if (friendship.userIds[1] === userId) {
      return [friendship.userIds[0]];
    }

    return [];
  });
}

const LIVE_RUN_SHARE_STALE_MS = 2 * 60 * 1000;

function ensureLiveRunSharesStore(store) {
  if (!Array.isArray(store.liveRunShares)) {
    store.liveRunShares = [];
  }
}

function normalizeLiveShareStatus(value) {
  return value === 'running' || value === 'paused' ? value : 'idle';
}

function normalizeLiveShareLabel(value) {
  return typeof value === 'string' ? value.trim().slice(0, 80) : '';
}

function getLiveRunShareByUserId(store, userId) {
  ensureLiveRunSharesStore(store);
  return store.liveRunShares.find((entry) => entry.userId === userId) ?? null;
}

function buildLiveRunSharePresentation(liveShare, nowIso = () => new Date().toISOString()) {
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

function areFriends(store, leftUserId, rightUserId) {
  return (store.friendships ?? []).some((entry) => (
    entry.userIds.includes(leftUserId) && entry.userIds.includes(rightUserId)
  ));
}

function buildFriendRank(store, user, rank, getUserMetrics, {
  nowIso = () => new Date().toISOString(),
} = {}) {
  const metrics = getUserMetrics(store, user.id);
  const liveShare = buildLiveRunSharePresentation(getLiveRunShareByUserId(store, user.id), nowIso);

  return {
    id: user.id,
    rank,
    name: user.name,
    tag: user.publicTag,
    // 친구 목록에 이름 옆 상태메시지 (프로필의 statusMessage — 없으면 생략).
    ...(typeof user.statusMessage === 'string' && user.statusMessage
      ? { statusMessage: user.statusMessage }
      : {}),
    // 프로필 화면의 지역 표시 재료 — 시/도 · 시군구 · 동 중 있는 것만 이어붙인다.
    ...(() => {
      const regionLabel = [user.provinceName, user.cityName, user.districtName]
        .filter((part) => typeof part === 'string' && part.trim())
        .join(' ');
      return regionLabel ? { regionLabel } : {};
    })(),
    // 친구 카드 행의 컴팩트 표시 재료: 동 단위 지역 + 랭크 티어.
    ...(typeof user.districtName === 'string' && user.districtName
      ? { districtName: user.districtName }
      : {}),
    ...(() => {
      const tier = resolveRankTier(user.rankState?.tier);
      return RANK_TIERS.includes(tier) ? { rankTier: tier } : {};
    })(),
    // Competitive leaderboard: rank by AND show the competitive weekly distance
    // (imports excluded) so the displayed number agrees with the sort key.
    distanceKm: metrics.competitiveWeekDistanceKm,
    points: metrics.currentWeekPoints,
    // Real KST-anchored 오늘/이번 달 aggregates — the client's window tabs
    // display these verbatim (it used to fabricate them from the week values).
    todayDistanceKm: metrics.competitiveTodayDistanceKm,
    todayPoints: metrics.todayPoints,
    monthDistanceKm: metrics.competitiveMonthDistanceKm,
    monthPoints: metrics.currentMonthPoints,
    ...(liveShare.isRunningNow ? { isRunningNow: true } : {}),
    ...(liveShare.liveLocationLabel ? { liveLocationLabel: liveShare.liveLocationLabel } : {}),
  };
}

function compareFriendRank(store, left, right, getUserMetrics) {
  const leftMetrics = getUserMetrics(store, left.id);
  const rightMetrics = getUserMetrics(store, right.id);
  const leftDistanceKm = leftMetrics.competitiveWeekDistanceKm;
  const rightDistanceKm = rightMetrics.competitiveWeekDistanceKm;

  if (rightDistanceKm !== leftDistanceKm) {
    return rightDistanceKm - leftDistanceKm;
  }

  const leftPoints = leftMetrics.currentWeekPoints;
  const rightPoints = rightMetrics.currentWeekPoints;

  if (rightPoints !== leftPoints) {
    return rightPoints - leftPoints;
  }

  return left.name.localeCompare(right.name, 'ko');
}

function requireFriendAccess(store, currentUserId, friendId, createError) {
  if (currentUserId === friendId || areFriends(store, currentUserId, friendId)) {
    return;
  }

  throw createError(403, '친구로 연결된 사용자 기록만 볼 수 있어요.');
}

function getActionableRequests(store, currentUserId, findUserById) {
  return (store.friendRequests ?? [])
    .filter((request) => request.status === 'pending')
    .filter((request) => request.requesterId === currentUserId || request.receiverId === currentUserId)
    .map((request) => {
      const otherUserId = request.requesterId === currentUserId ? request.receiverId : request.requesterId;
      const otherUser = findUserById(store, otherUserId);

      return {
        id: request.id,
        name: otherUser.name,
        tag: otherUser.publicTag,
        status: request.requesterId === currentUserId ? 'pending' : 'received',
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'ko'));
}

function buildFriendLeaderboard(store, user, {
  findUserById,
  getUserMetrics,
  nowIso,
}) {
  const relatedUserIds = [...new Set([user.id, ...getFriendIds(store, user.id)])];
  const ranks = relatedUserIds
    .map((userId) => findUserById(store, userId))
    .sort((left, right) => compareFriendRank(store, left, right, getUserMetrics))
    .map((entry, index) => buildFriendRank(store, entry, index + 1, getUserMetrics, { nowIso }));

  return {
    ranks,
    requests: getActionableRequests(store, user.id, findUserById),
  };
}

function getRunForUser(runs, runId, createError) {
  if (!runs.length) {
    throw createError(404, '러닝 기록이 없어요.');
  }

  if (!runId) {
    return runs[0];
  }

  const run = runs.find((entry) => entry.id === runId);

  if (!run) {
    throw createError(404, '러닝 기록을 찾을 수 없어요.');
  }

  return run;
}

export function createJsonFriendsRepository({
  loadStore,
  mutateStore,
  requireUserByToken,
  findUserById,
  getRunsForUser,
  getUserMetrics,
  buildRunDetail,
  nextId,
  nowIso = () => new Date().toISOString(),
  createError,
  // #209: resolves a run's GPS route from the run_routes side table when the store driver keeps
  // routes out of the whole-store blob (postgres). Defaults to null so the json driver (and any
  // caller that does not wire it) keeps today's embedded-route behavior byte-for-byte.
  getStoredRunRoute = async () => null,
}) {
  // 태그 기반/유저ID 기반 친구 신청이 공유하는 생성 로직 — 검증(자기 자신,
  // 이미 친구, 대기 중 중복)과 알림 발송이 항상 동일하게 걸린다.
  function pushFriendRequestToTarget(store, currentUser, targetUser) {
    if (!Array.isArray(store.friendRequests)) {
      store.friendRequests = [];
    }

    if (targetUser.id === currentUser.id) {
      throw createError(400, '나 자신에게는 친구 요청을 보낼 수 없어요.');
    }

    if (areFriends(store, currentUser.id, targetUser.id)) {
      throw createError(409, '이미 친구로 연결되어 있어요.');
    }

    const existingRequest = (store.friendRequests ?? []).find((entry) => (
      entry.status === 'pending'
      && (
        (entry.requesterId === currentUser.id && entry.receiverId === targetUser.id)
        || (entry.requesterId === targetUser.id && entry.receiverId === currentUser.id)
      )
    ));

    if (existingRequest) {
      throw createError(409, '이미 대기 중인 친구 요청이 있어요.');
    }

    const requestId = nextId('request');

    store.friendRequests.push({
      id: requestId,
      requesterId: currentUser.id,
      receiverId: targetUser.id,
      status: 'pending',
      createdAt: nowIso(),
    });
    appendUserNotification(store, {
      userId: targetUser.id,
      type: 'friend_request',
      title: '새 친구 요청',
      body: `${currentUser.name}님이 친구 요청을 보냈어요.`,
      data: {
        friendUserId: currentUser.id,
        requestId,
      },
      nowIso,
    });

    return {
      success: true,
      requestId,
      status: 'pending',
    };
  }

  return {
    async getLeaderboard({ token }) {
      const store = await loadStore();
      const user = requireUserByToken(store, token);

      return buildFriendLeaderboard(store, user, {
        findUserById,
        getUserMetrics,
        nowIso,
      });
    },

    async updateLiveSharing({ token, enabled, status, locationLabel }) {
      return mutateStore((store) => {
        ensureLiveRunSharesStore(store);

        const currentUser = requireUserByToken(store, token);
        const nextStatus = normalizeLiveShareStatus(status);
        const updatedAt = nowIso();
        const normalizedLocationLabel = normalizeLiveShareLabel(locationLabel);

        store.liveRunShares = store.liveRunShares.filter((entry) => entry.userId !== currentUser.id);

        if (enabled && (nextStatus === 'running' || nextStatus === 'paused')) {
          store.liveRunShares.push({
            userId: currentUser.id,
            enabled: true,
            status: nextStatus,
            ...(normalizedLocationLabel ? { locationLabel: normalizedLocationLabel } : {}),
            updatedAt,
          });
        }

        const liveShare = getLiveRunShareByUserId(store, currentUser.id);
        const presentation = buildLiveRunSharePresentation(liveShare, nowIso);

        return {
          success: true,
          liveSharingEnabled: Boolean(liveShare?.enabled),
          isRunningNow: presentation.isRunningNow,
          ...(presentation.liveLocationLabel ? { locationLabel: presentation.liveLocationLabel } : {}),
          updatedAt,
        };
      });
    },

    async createRequest({ token, tag }) {
      return mutateStore((store) => {
        const currentUser = requireUserByToken(store, token);
        const targetUser = store.users.find((entry) => entry.publicTag === tag);

        if (!targetUser) {
          throw createError(404, '해당 태그의 사용자를 찾지 못했어요.');
        }

        return pushFriendRequestToTarget(store, currentUser, targetUser);
      });
    },

    // 랭킹 보드 등 태그가 없는 곳에서 사람을 눌러 친구 신청하는 경로 — 검증/알림은
    // 태그 기반 createRequest와 완전히 동일한 공유 로직을 탄다.
    async createRequestByUserId({ token, userId }) {
      return mutateStore((store) => {
        const currentUser = requireUserByToken(store, token);
        // findUserById는 미존재 시 404를 던진다.
        const targetUser = findUserById(store, userId);

        return pushFriendRequestToTarget(store, currentUser, targetUser);
      });
    },

    // 사람 탭 시의 분기 재료: 나/친구/보낸 신청 대기/받은 신청 대기/무관계.
    async getUserRelation({ token, userId }) {
      const store = await loadStore();
      const currentUser = requireUserByToken(store, token);
      // findUserById는 미존재 시 404를 던진다.
      const targetUser = findUserById(store, userId);

      let relation = 'none';

      if (targetUser.id === currentUser.id) {
        relation = 'self';
      } else if (areFriends(store, currentUser.id, targetUser.id)) {
        relation = 'friend';
      } else {
        const pendingRequest = (store.friendRequests ?? []).find((entry) => (
          entry.status === 'pending'
          && (
            (entry.requesterId === currentUser.id && entry.receiverId === targetUser.id)
            || (entry.requesterId === targetUser.id && entry.receiverId === currentUser.id)
          )
        ));

        if (pendingRequest) {
          relation = pendingRequest.requesterId === currentUser.id ? 'outgoing' : 'incoming';
        }
      }

      return {
        userId: targetUser.id,
        name: targetUser.name,
        relation,
      };
    },

    async respondToRequest({ token, requestId, action }) {
      return mutateStore((store) => {
        if (!Array.isArray(store.friendRequests)) {
          store.friendRequests = [];
        }

        if (!Array.isArray(store.friendships)) {
          store.friendships = [];
        }

        const currentUser = requireUserByToken(store, token);
        const friendRequest = (store.friendRequests ?? []).find((entry) => entry.id === requestId);

        if (!friendRequest || friendRequest.status !== 'pending') {
          throw createError(404, '처리할 친구 요청을 찾을 수 없어요.');
        }

        if ((action === 'accept' || action === 'reject') && friendRequest.receiverId !== currentUser.id) {
          throw createError(403, '받은 친구 요청만 처리할 수 있어요.');
        }

        if (action === 'cancel' && friendRequest.requesterId !== currentUser.id) {
          throw createError(403, '내가 보낸 요청만 취소할 수 있어요.');
        }

        if (action === 'accept') {
          friendRequest.status = 'accepted';

          if (!areFriends(store, friendRequest.requesterId, friendRequest.receiverId)) {
            store.friendships.push({
              id: nextId('friendship'),
              userIds: [friendRequest.requesterId, friendRequest.receiverId],
              createdAt: nowIso(),
            });
          }
          appendUserNotification(store, {
            userId: friendRequest.requesterId,
            type: 'friend_accepted',
            title: '친구 요청 수락',
            body: `${currentUser.name}님이 친구 요청을 수락했어요.`,
            data: {
              friendUserId: currentUser.id,
              requestId: friendRequest.id,
            },
            nowIso,
          });
        }

        if (action === 'reject') {
          friendRequest.status = 'rejected';
        }

        if (action === 'cancel') {
          friendRequest.status = 'cancelled';
        }

        return {
          success: true,
          requestId: friendRequest.id,
          status: action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'cancelled',
        };
      });
    },

    async getFriendActivity({ token, friendId }) {
      const store = await loadStore();
      const currentUser = requireUserByToken(store, token);
      requireFriendAccess(store, currentUser.id, friendId, createError);

      const friend = findUserById(store, friendId);
      const runs = getRunsForUser(store, friend.id);
      const friendMetrics = getUserMetrics(store, friend.id);
      const leaderboard = buildFriendLeaderboard(store, currentUser, {
        findUserById,
        getUserMetrics,
        nowIso,
      });
      const rankedFriend = leaderboard.ranks.find((entry) => entry.id === friend.id)
        ?? buildFriendRank(store, friend, 1, getUserMetrics, { nowIso });

      return {
        friend: rankedFriend,
        runs: runs.map((run) => ({
          id: run.id,
          date: run.date,
          distanceKm: run.distanceKm,
          pace: run.pace,
        })),
        monthlyDistanceKm: friendMetrics.currentMonthDistanceKm,
        monthlyPoints: friendMetrics.currentMonthPoints,
      };
    },

    async getFriendRun({ token, friendId, runId }) {
      const store = await loadStore();
      const currentUser = requireUserByToken(store, token);
      requireFriendAccess(store, currentUser.id, friendId, createError);

      const run = await attachStoredRunRoute(
        getRunForUser(getRunsForUser(store, friendId), runId, createError),
        getStoredRunRoute,
      );
      const metrics = getUserMetrics(store, friendId);

      return buildRunDetail(run, metrics.currentWeekDistanceKm, '친구 기록', metrics);
    },
  };
}
