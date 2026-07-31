import {
  createNowIso,
  normalizeLiveShareStatus,
} from './postgresFriendsHelpers.mjs';
import {
  addCheerToEntry,
  buildFriendLiveRunPayload,
  buildNextLiveShareEntry,
  drainPendingCheers,
} from '../lib/liveRunShare.mjs';
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

    async updateLiveSharing({ token, enabled, status, locationLabel, latitude, longitude, distanceKm, paceLabel, allowCheers }) {
      return runWriteOperation(database, async (client) => {
        const currentUser = await requireUserByToken(client, token, createError);
        const updatedAt = nowIso();
        const nextStatus = normalizeLiveShareStatus(status);
        const liveRunShares = await loadLiveRunShares(client);
        const previousEntry = liveRunShares[currentUser.id] ?? null;

        // 하트비트가 곧 응원 수령 채널: 이전 엔트리의 응원을 이번 응답에 실어 보내고 비운다.
        const { cheers } = drainPendingCheers(previousEntry);
        const nextEntry = buildNextLiveShareEntry({
          previousEntry,
          enabled,
          status: nextStatus,
          locationLabel,
          latitude,
          longitude,
          distanceKm,
          paceLabel,
          allowCheers,
          nowIso: () => updatedAt,
        });

        delete liveRunShares[currentUser.id];

        if (nextEntry) {
          liveRunShares[currentUser.id] = { ...nextEntry, cheers: [] };
        }

        await saveLiveRunShares(client, liveRunShares);
        const presentation = buildLiveRunSharePresentation(liveRunShares[currentUser.id], () => updatedAt);

        return {
          success: true,
          liveSharingEnabled: Boolean(liveRunShares[currentUser.id]?.enabled),
          isRunningNow: presentation.isRunningNow,
          ...(presentation.liveLocationLabel ? { locationLabel: presentation.liveLocationLabel } : {}),
          updatedAt,
          ...(cheers.length ? { cheers } : {}),
        };
      });
    },

    // 친구에게 응원 보내기 — 러너의 라이브 엔트리에 쌓아 두면 하트비트가 가져간다.
    async sendCheer({ token, friendId, message }) {
      return runWriteOperation(database, async (client) => {
        const currentUser = await requireUserByToken(client, token, createError);
        const friendUser = await findUserById(client, friendId, createError);

        if (!(await hasFriendship(client, currentUser.id, friendUser.id))) {
          throw createError(403, '친구에게만 응원을 보낼 수 있어요.');
        }

        const liveRunShares = await loadLiveRunShares(client);
        const result = addCheerToEntry(liveRunShares[friendUser.id] ?? null, {
          cheerId: nextId('cheer'),
          fromUserId: currentUser.id,
          fromName: currentUser.name,
          message,
          nowMs: Date.parse(nowIso()),
        });

        if (!result.ok) {
          throw createError(result.statusCode, result.message);
        }

        liveRunShares[friendUser.id] = result.entry;
        await saveLiveRunShares(client, liveRunShares);

        return { success: true };
      });
    },

    // 친구 라이브 러닝 조회 — 지도 화면이 폴링한다.
    async getFriendLiveRun({ token, friendId }) {
      const currentUser = await requireUserByToken(database, token, createError);
      const friendUser = await findUserById(database, friendId, createError);

      if (!(await hasFriendship(database, currentUser.id, friendUser.id))) {
        throw createError(403, '친구의 러닝만 볼 수 있어요.');
      }

      const liveRunShares = await loadLiveRunShares(database);

      return buildFriendLiveRunPayload(
        liveRunShares[friendUser.id] ?? null,
        friendUser.name,
        Date.parse(nowIso()),
      );
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
