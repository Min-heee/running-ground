import {
  createNowIso,
  normalizeLiveShareLabel,
  normalizeLiveShareStatus,
} from './postgresFriendsHelpers.mjs';
import {
  buildFriendRank,
  buildLiveRunSharePresentation,
  getRunForUser,
  sortFriendPair,
} from './postgresFriendsRanking.mjs';
import {
  buildLeaderboardContext,
  findFriendRequestById,
  findPendingRequestBetween,
  findUserById,
  findUserByPublicTag,
  hasFriendship,
  loadLiveRunShares,
  loadRunsByUserIds,
  requireFriendAccess,
  requireUserByToken,
  runWriteOperation,
  saveLiveRunShares,
} from './postgresFriendsQueries.mjs';

export function createPostgresFriendsRepository({
  database,
  nextId,
  buildRunDetail,
  buildUserMetrics,
  createError,
  nowIso = createNowIso,
}) {
  if (!database || typeof database.query !== 'function') {
    throw new Error('createPostgresFriendsRepository requires a database query adapter.');
  }

  if (typeof buildUserMetrics !== 'function') {
    throw new Error('createPostgresFriendsRepository requires a buildUserMetrics function.');
  }

  return {
    async getLeaderboardByUserId({ currentUserId }) {
      const currentUser = await findUserById(database, currentUserId, createError);
      const context = await buildLeaderboardContext(database, currentUser, buildUserMetrics, nowIso);

      return {
        ranks: context.ranks,
        requests: context.requests,
      };
    },

    async getLeaderboard({ token }) {
      const currentUser = await requireUserByToken(database, token, createError);
      return this.getLeaderboardByUserId({
        currentUserId: currentUser.id,
      });
    },

    async updateLiveSharing({ token, enabled, status, locationLabel }) {
      return runWriteOperation(database, async (client) => {
        const currentUser = await requireUserByToken(client, token, createError);
        const updatedAt = nowIso();
        const nextStatus = normalizeLiveShareStatus(status);
        const normalizedLocationLabel = normalizeLiveShareLabel(locationLabel);
        const liveRunShares = await loadLiveRunShares(client);

        delete liveRunShares[currentUser.id];

        if (enabled && (nextStatus === 'running' || nextStatus === 'paused')) {
          liveRunShares[currentUser.id] = {
            enabled: true,
            status: nextStatus,
            ...(normalizedLocationLabel ? { locationLabel: normalizedLocationLabel } : {}),
            updatedAt,
          };
        }

        await saveLiveRunShares(client, liveRunShares);
        const presentation = buildLiveRunSharePresentation(liveRunShares[currentUser.id], () => updatedAt);

        return {
          success: true,
          liveSharingEnabled: Boolean(liveRunShares[currentUser.id]?.enabled),
          isRunningNow: presentation.isRunningNow,
          ...(presentation.liveLocationLabel ? { locationLabel: presentation.liveLocationLabel } : {}),
          updatedAt,
        };
      });
    },

    async createRequest({ token, tag }) {
      return runWriteOperation(database, async (client) => {
        const currentUser = await requireUserByToken(client, token, createError);
        const targetUser = await findUserByPublicTag(client, tag);

        if (!targetUser) {
          throw createError(404, '해당 태그의 사용자를 찾지 못했어요.');
        }

        if (targetUser.id === currentUser.id) {
          throw createError(400, '내 태그로는 친구 요청을 보낼 수 없어요.');
        }

        if (await hasFriendship(client, currentUser.id, targetUser.id)) {
          throw createError(409, '이미 친구로 연결되어 있어요.');
        }

        if (await findPendingRequestBetween(client, currentUser.id, targetUser.id)) {
          throw createError(409, '이미 대기 중인 친구 요청이 있어요.');
        }

        const requestId = nextId('request');
        const createdAt = nowIso();

        await client.query(
          `
            insert into friend_requests (
              id, requester_id, receiver_id, status, created_at, updated_at
            )
            values ($1, $2, $3, $4, $5, $6)
          `,
          [requestId, currentUser.id, targetUser.id, 'pending', createdAt, createdAt],
        );

        return {
          success: true,
          requestId,
          status: 'pending',
        };
      });
    },

    async respondToRequest({ token, requestId, action }) {
      return runWriteOperation(database, async (client) => {
        const currentUser = await requireUserByToken(client, token, createError);
        const friendRequest = await findFriendRequestById(client, requestId);

        if (!friendRequest || friendRequest.status !== 'pending') {
          throw createError(404, '처리할 친구 요청을 찾을 수 없어요.');
        }

        if ((action === 'accept' || action === 'reject') && friendRequest.receiverId !== currentUser.id) {
          throw createError(403, '받은 친구 요청만 처리할 수 있어요.');
        }

        if (action === 'cancel' && friendRequest.requesterId !== currentUser.id) {
          throw createError(403, '내가 보낸 요청만 취소할 수 있어요.');
        }

        const nextStatus = action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'cancelled';
        const updatedAt = nowIso();

        await client.query(
          `
            update friend_requests
            set status = $2,
                updated_at = $3
            where id = $1
          `,
          [friendRequest.id, nextStatus, updatedAt],
        );

        if (action === 'accept' && !(await hasFriendship(client, friendRequest.requesterId, friendRequest.receiverId))) {
          const [userAId, userBId] = sortFriendPair(friendRequest.requesterId, friendRequest.receiverId);

          await client.query(
            `
              insert into friendships (id, user_a_id, user_b_id, created_at)
              values ($1, $2, $3, $4)
            `,
            [nextId('friendship'), userAId, userBId, updatedAt],
          );
        }

        return {
          success: true,
          requestId: friendRequest.id,
          status: nextStatus,
        };
      });
    },

    async getFriendActivityByUserId({ currentUserId, friendId }) {
      const currentUser = await findUserById(database, currentUserId, createError);
      await requireFriendAccess(database, currentUser.id, friendId, createError);

      const friend = await findUserById(database, friendId, createError);
      const context = await buildLeaderboardContext(database, currentUser, buildUserMetrics, nowIso);
      const friendRuns = context.runsByUserId.get(friend.id) ?? [];
      const friendMetrics = context.metricsByUserId.get(friend.id) ?? buildUserMetrics(friendRuns);
      const rankedFriend = context.ranks.find((entry) => entry.id === friend.id)
        ?? buildFriendRank(friend, 1, friendMetrics, context.liveRunShares[friend.id], nowIso);

      return {
        friend: rankedFriend,
        runs: friendRuns.map((run) => ({
          id: run.id,
          date: run.date,
          distanceKm: run.distanceKm,
          pace: run.pace,
        })),
        monthlyDistanceKm: friendMetrics.currentMonthDistanceKm,
        monthlyPoints: friendMetrics.currentMonthPoints,
      };
    },

    async getFriendActivity({ token, friendId }) {
      const currentUser = await requireUserByToken(database, token, createError);
      return this.getFriendActivityByUserId({
        currentUserId: currentUser.id,
        friendId,
      });
    },

    async getFriendRunByUserId({ currentUserId, friendId, runId }) {
      const currentUser = await findUserById(database, currentUserId, createError);
      await requireFriendAccess(database, currentUser.id, friendId, createError);

      await findUserById(database, friendId, createError);
      const runsByUserId = await loadRunsByUserIds(database, [friendId]);
      const runs = runsByUserId.get(friendId) ?? [];
      const run = getRunForUser(runs, runId, createError);
      const metrics = buildUserMetrics(runs);

      return buildRunDetail(run, metrics.currentWeekDistanceKm, '친구 기록', metrics);
    },

    async getFriendRun({ token, friendId, runId }) {
      const currentUser = await requireUserByToken(database, token, createError);
      return this.getFriendRunByUserId({
        currentUserId: currentUser.id,
        friendId,
        runId,
      });
    },
  };
}
