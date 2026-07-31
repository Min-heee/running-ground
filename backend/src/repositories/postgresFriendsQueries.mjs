import {
  clone,
  createNowIso,
  LIVE_RUN_SHARE_METADATA_KEY,
} from './postgresFriendsHelpers.mjs';
import {
  buildFriendRank,
  buildMetricsByUserId,
  compareFriendRank,
  sortFriendPair,
} from './postgresFriendsRanking.mjs';
import {
  mapFriendRequestRow,
  mapRunRow,
  mapUserRow,
} from './postgresFriendsRowMappers.mjs';

export async function runWriteOperation(database, callback) {
  if (typeof database.transaction === 'function') {
    return database.transaction(callback);
  }

  return callback(database);
}

export async function requireUserByToken(database, token, createError) {
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
    throw createError(401, '세션이 만료됐어요. 다시 로그인해주세요.');
  }

  return mapUserRow(result.rows[0]);
}

export async function findUserById(database, userId, createError) {
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
    throw createError(404, '사용자를 찾을 수 없어요.');
  }

  return mapUserRow(result.rows[0]);
}

export async function findUserByPublicTag(database, publicTag) {
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

export async function loadUsersByIds(database, userIds) {
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

export async function loadRunsByUserIds(database, userIds) {
  if (!userIds.length) {
    return new Map();
  }

  const result = await database.query(
    `
      select id, user_id, run_date, distance_km, pace, source_label, source_type, external_id,
             route, match_result, duration_seconds, cadence_spm, elevation_gain_m, started_at, ended_at,
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

export async function loadLiveRunShares(database, { forUpdate = false } = {}) {
  // 쓰기 경로는 행 잠금이 필수다: 모든 러너의 엔트리가 이 한 행에 살고, 하트비트(25초)와
  // 응원 POST가 read-modify-write로 전체 맵을 다시 쓴다. 잠금 없인 나중에 커밋한 쪽이
  // 통째로 이겨 응원이 사라지거나 두 번 재생된다(적대 검증 발견 — app_store 블롭이 쓰는
  // FOR UPDATE 규율과 동일하게 맞춘다). 행이 없으면 먼저 심어야 잠글 대상이 생긴다.
  if (forUpdate) {
    await database.query(
      `
        insert into app_metadata (key, value, updated_at)
        values ($1, '{}'::jsonb, now())
        on conflict (key) do nothing
      `,
      [LIVE_RUN_SHARE_METADATA_KEY],
    );
  }

  const result = await database.query(
    `
      select value
      from app_metadata
      where key = $1
      limit 1
      ${forUpdate ? 'for update' : ''}
    `,
    [LIVE_RUN_SHARE_METADATA_KEY],
  );

  const rawValue = result.rows[0]?.value;
  return rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
    ? clone(rawValue)
    : {};
}

export async function saveLiveRunShares(database, liveRunShares) {
  await database.query(
    `
      insert into app_metadata (key, value, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (key)
      do update set
        value = excluded.value,
        updated_at = now()
    `,
    [LIVE_RUN_SHARE_METADATA_KEY, JSON.stringify(liveRunShares)],
  );
}

export async function loadFriendIdsForUser(database, userId) {
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

export async function hasFriendship(database, leftUserId, rightUserId) {
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

export async function requireFriendAccess(database, currentUserId, friendId, createError) {
  if (currentUserId === friendId) {
    return;
  }

  if (await hasFriendship(database, currentUserId, friendId)) {
    return;
  }

  throw createError(403, '친구로 연결된 사용자 기록만 볼 수 있어요.');
}

export async function findPendingRequestBetween(database, leftUserId, rightUserId) {
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

export async function loadPendingRequestsForUser(database, userId) {
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

export async function findFriendRequestById(database, requestId) {
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

export async function buildActionableRequests(database, currentUserId) {
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

export async function buildLeaderboardContext(database, currentUser, buildUserMetrics, nowIso = createNowIso) {
  const friendIds = await loadFriendIdsForUser(database, currentUser.id);
  const userIds = [...new Set([currentUser.id, ...friendIds])];
  const users = await loadUsersByIds(database, userIds);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const runsByUserId = await loadRunsByUserIds(database, userIds);
  const metricsByUserId = buildMetricsByUserId(runsByUserId, userIds, buildUserMetrics);
  const liveRunShares = await loadLiveRunShares(database);
  const ranks = [...users]
    .sort((left, right) => compareFriendRank(left, right, metricsByUserId))
    .map((user, index) => buildFriendRank(user, index + 1, metricsByUserId.get(user.id), liveRunShares[user.id], nowIso));
  const requests = await buildActionableRequests(database, currentUser.id);

  return {
    usersById,
    runsByUserId,
    metricsByUserId,
    liveRunShares,
    ranks,
    requests,
  };
}
