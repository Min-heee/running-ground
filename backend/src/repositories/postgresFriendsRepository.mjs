function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asNumber(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function toIsoString(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' && value) {
    return value;
  }

  return '';
}

function toDateOnly(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'string' && value) {
    return value.slice(0, 10);
  }

  return '';
}

function createNowIso() {
  return new Date().toISOString();
}

function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function mapUserRow(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.nickname,
    realName: row.real_name ?? '',
    phone: row.phone ?? '',
    birthDate: toDateOnly(row.birth_date),
    publicTag: row.public_tag,
    provinceName: row.province_name ?? '',
    cityName: row.city_name ?? '',
    districtName: row.district_name ?? '',
    universityName: row.university_name ?? '',
    addressDetail: row.address_detail ?? '',
    rewardPoints: asNumber(row.reward_points),
    streakDays: asNumber(row.streak_days),
    connectedSources: asArray(row.connected_sources),
    notificationSettings: asObject(row.notification_settings),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapRunRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    date: toDateOnly(row.run_date),
    distanceKm: asNumber(row.distance_km),
    pace: row.pace ?? '',
    source: row.source_label ?? 'Manual',
    sourceType: row.source_type ?? 'manual',
    ...(row.external_id ? { externalId: row.external_id } : {}),
    ...(Array.isArray(row.route) ? { route: clone(row.route) } : {}),
    ...(hasValue(row.duration_seconds) ? { durationSeconds: asNumber(row.duration_seconds) } : {}),
    ...(hasValue(row.cadence_spm) ? { cadenceSpm: asNumber(row.cadence_spm) } : {}),
    ...(hasValue(row.elevation_gain_m) ? { elevationGainM: asNumber(row.elevation_gain_m) } : {}),
    ...(normalizeOptionalString(row.started_at) ? { startedAt: toIsoString(row.started_at) } : {}),
    ...(normalizeOptionalString(row.ended_at) ? { endedAt: toIsoString(row.ended_at) } : {}),
    ...(normalizeOptionalString(row.imported_at) ? { importedAt: toIsoString(row.imported_at) } : {}),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapFriendRequestRow(row) {
  return {
    id: row.id,
    requesterId: row.requester_id,
    receiverId: row.receiver_id,
    status: row.status ?? 'pending',
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function sortFriendPair(leftUserId, rightUserId) {
  return leftUserId < rightUserId ? [leftUserId, rightUserId] : [rightUserId, leftUserId];
}

async function runWriteOperation(database, callback) {
  if (typeof database.transaction === 'function') {
    return database.transaction(callback);
  }

  return callback(database);
}

async function requireUserByToken(database, token, createError) {
  const result = await database.query(
    `
      select u.*
      from sessions s
      join users u on u.id = s.user_id
      where s.token = $1
        and s.expires_at > now()
      limit 1
    `,
    [token],
  );

  if (!result.rows[0]) {
    throw createError(401, '세션이 만료됐어. 다시 로그인해줘.');
  }

  return mapUserRow(result.rows[0]);
}

async function findUserById(database, userId, createError) {
  const result = await database.query(
    `
      select *
      from users
      where id = $1
      limit 1
    `,
    [userId],
  );

  if (!result.rows[0]) {
    throw createError(404, '사용자를 찾을 수 없어.');
  }

  return mapUserRow(result.rows[0]);
}

async function findUserByPublicTag(database, publicTag) {
  const result = await database.query(
    `
      select *
      from users
      where public_tag = $1
      limit 1
    `,
    [publicTag],
  );

  return result.rows[0] ? mapUserRow(result.rows[0]) : null;
}

async function loadUsersByIds(database, userIds) {
  if (!userIds.length) {
    return [];
  }

  const result = await database.query(
    `
      select *
      from users
      where id = any($1::text[])
    `,
    [userIds],
  );

  return result.rows.map(mapUserRow);
}

async function loadRunsByUserIds(database, userIds) {
  if (!userIds.length) {
    return new Map();
  }

  const result = await database.query(
    `
      select id, user_id, run_date, distance_km, pace, source_label, source_type, external_id,
             route, duration_seconds, cadence_spm, elevation_gain_m, started_at, ended_at,
             imported_at, created_at, updated_at
      from runs
      where user_id = any($1::text[])
      order by user_id asc, run_date desc, created_at desc
    `,
    [userIds],
  );

  const runsByUserId = new Map(userIds.map((userId) => [userId, []]));

  for (const row of result.rows) {
    const run = mapRunRow(row);
    runsByUserId.set(run.userId, [...(runsByUserId.get(run.userId) ?? []), run]);
  }

  return runsByUserId;
}

async function loadFriendIdsForUser(database, userId) {
  const result = await database.query(
    `
      select user_a_id, user_b_id
      from friendships
      where user_a_id = $1
         or user_b_id = $1
    `,
    [userId],
  );

  return result.rows.flatMap((row) => {
    if (row.user_a_id === userId) {
      return [row.user_b_id];
    }

    if (row.user_b_id === userId) {
      return [row.user_a_id];
    }

    return [];
  });
}

async function hasFriendship(database, leftUserId, rightUserId) {
  const [userAId, userBId] = sortFriendPair(leftUserId, rightUserId);
  const result = await database.query(
    `
      select id
      from friendships
      where user_a_id = $1
        and user_b_id = $2
      limit 1
    `,
    [userAId, userBId],
  );

  return Boolean(result.rows[0]);
}

async function requireFriendAccess(database, currentUserId, friendId, createError) {
  if (currentUserId === friendId) {
    return;
  }

  if (await hasFriendship(database, currentUserId, friendId)) {
    return;
  }

  throw createError(403, '친구로 연결된 사용자 기록만 볼 수 있어.');
}

async function findPendingRequestBetween(database, leftUserId, rightUserId) {
  const result = await database.query(
    `
      select id
      from friend_requests
      where status = 'pending'
        and (
          (requester_id = $1 and receiver_id = $2)
          or
          (requester_id = $2 and receiver_id = $1)
        )
      limit 1
    `,
    [leftUserId, rightUserId],
  );

  return result.rows[0] ?? null;
}

async function loadPendingRequestsForUser(database, userId) {
  const result = await database.query(
    `
      select id, requester_id, receiver_id, status, created_at, updated_at
      from friend_requests
      where status = 'pending'
        and (
          requester_id = $1
          or receiver_id = $1
        )
      order by created_at asc
    `,
    [userId],
  );

  return result.rows.map(mapFriendRequestRow);
}

async function findFriendRequestById(database, requestId) {
  const result = await database.query(
    `
      select id, requester_id, receiver_id, status, created_at, updated_at
      from friend_requests
      where id = $1
      limit 1
    `,
    [requestId],
  );

  return result.rows[0] ? mapFriendRequestRow(result.rows[0]) : null;
}

function getRunForUser(runs, runId, createError) {
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

function buildFriendRank(user, rank, metrics) {
  return {
    id: user.id,
    rank,
    name: user.name,
    tag: user.publicTag,
    distanceKm: metrics.currentWeekDistanceKm,
    points: metrics.currentWeekPoints,
  };
}

function compareFriendRank(leftUser, rightUser, metricsByUserId) {
  const leftMetrics = metricsByUserId.get(leftUser.id);
  const rightMetrics = metricsByUserId.get(rightUser.id);
  const leftDistanceKm = leftMetrics?.currentWeekDistanceKm ?? 0;
  const rightDistanceKm = rightMetrics?.currentWeekDistanceKm ?? 0;

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

function buildMetricsByUserId(runsByUserId, userIds, buildUserMetrics) {
  return new Map(userIds.map((userId) => [
    userId,
    buildUserMetrics(runsByUserId.get(userId) ?? []),
  ]));
}

async function buildActionableRequests(database, currentUserId) {
  const requests = await loadPendingRequestsForUser(database, currentUserId);
  const otherUserIds = [...new Set(requests.map((request) => (
    request.requesterId === currentUserId ? request.receiverId : request.requesterId
  )))];
  const users = await loadUsersByIds(database, otherUserIds);
  const usersById = new Map(users.map((user) => [user.id, user]));

  return requests
    .map((request) => {
      const otherUserId = request.requesterId === currentUserId ? request.receiverId : request.requesterId;
      const otherUser = usersById.get(otherUserId);

      if (!otherUser) {
        return null;
      }

      return {
        id: request.id,
        name: otherUser.name,
        tag: otherUser.publicTag,
        status: request.requesterId === currentUserId ? 'pending' : 'received',
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name, 'ko'));
}

async function buildLeaderboardContext(database, currentUser, buildUserMetrics) {
  const friendIds = await loadFriendIdsForUser(database, currentUser.id);
  const userIds = [...new Set([currentUser.id, ...friendIds])];
  const users = await loadUsersByIds(database, userIds);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const runsByUserId = await loadRunsByUserIds(database, userIds);
  const metricsByUserId = buildMetricsByUserId(runsByUserId, userIds, buildUserMetrics);
  const ranks = [...users]
    .sort((left, right) => compareFriendRank(left, right, metricsByUserId))
    .map((user, index) => buildFriendRank(user, index + 1, metricsByUserId.get(user.id)));
  const requests = await buildActionableRequests(database, currentUser.id);

  return {
    usersById,
    runsByUserId,
    metricsByUserId,
    ranks,
    requests,
  };
}

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
      const context = await buildLeaderboardContext(database, currentUser, buildUserMetrics);

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

    async createRequest({ token, tag }) {
      return runWriteOperation(database, async (client) => {
        const currentUser = await requireUserByToken(client, token, createError);
        const targetUser = await findUserByPublicTag(client, tag);

        if (!targetUser) {
          throw createError(404, '해당 태그의 사용자를 찾지 못했어.');
        }

        if (targetUser.id === currentUser.id) {
          throw createError(400, '내 태그로는 친구 요청을 보낼 수 없어.');
        }

        if (await hasFriendship(client, currentUser.id, targetUser.id)) {
          throw createError(409, '이미 친구로 연결되어 있어.');
        }

        if (await findPendingRequestBetween(client, currentUser.id, targetUser.id)) {
          throw createError(409, '이미 대기 중인 친구 요청이 있어.');
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
          throw createError(404, '처리할 친구 요청을 찾을 수 없어.');
        }

        if ((action === 'accept' || action === 'reject') && friendRequest.receiverId !== currentUser.id) {
          throw createError(403, '받은 친구 요청만 처리할 수 있어.');
        }

        if (action === 'cancel' && friendRequest.requesterId !== currentUser.id) {
          throw createError(403, '내가 보낸 요청만 취소할 수 있어.');
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
      const context = await buildLeaderboardContext(database, currentUser, buildUserMetrics);
      const friendRuns = context.runsByUserId.get(friend.id) ?? [];
      const friendMetrics = context.metricsByUserId.get(friend.id) ?? buildUserMetrics(friendRuns);
      const rankedFriend = context.ranks.find((entry) => entry.id === friend.id)
        ?? buildFriendRank(friend, 1, friendMetrics);

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
