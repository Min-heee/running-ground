function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

async function loadUsersByRegion(database, user) {
  const result = await database.query(
    `
      select *
      from users
      where coalesce(province_name, '') = $1
        and coalesce(city_name, '') = $2
        and coalesce(district_name, '') = $3
    `,
    [user.provinceName ?? '', user.cityName ?? '', user.districtName ?? ''],
  );

  return result.rows.map(mapUserRow);
}

async function loadUsersWithUniversity(database) {
  const result = await database.query(
    `
      select *
      from users
      where coalesce(university_name, '') <> ''
    `,
    [],
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

async function loadRegionTree(database, defaultRegionTree) {
  const result = await database.query(
    `
      select value
      from app_metadata
      where key = $1
      limit 1
    `,
    ['region_tree'],
  );

  const regionTree = result.rows[0]?.value;

  if (regionTree && typeof regionTree === 'object' && !Array.isArray(regionTree)) {
    return clone(regionTree);
  }

  if (defaultRegionTree && typeof defaultRegionTree === 'object') {
    return clone(defaultRegionTree);
  }

  return {
    id: 'region-root',
    name: '대한민국',
    level: 'country',
    children: [],
  };
}

function buildMetricsByUserId(runsByUserId, userIds, buildUserMetrics) {
  return new Map(userIds.map((userId) => [
    userId,
    buildUserMetrics(runsByUserId.get(userId) ?? []),
  ]));
}

function buildDistrictRank(user, rank, currentUserId, metrics) {
  return {
    id: user.id,
    rank,
    name: user.name,
    distanceKm: metrics.currentWeekDistanceKm,
    points: metrics.currentWeekPoints,
    ...(user.id === currentUserId ? { isMe: true } : {}),
  };
}

function compareDistrictRank(leftUser, rightUser, metricsByUserId) {
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

function normalizeRegionChildren(children) {
  return [...children]
    .sort((left, right) => {
      if (right.averageDistanceKm !== left.averageDistanceKm) {
        return right.averageDistanceKm - left.averageDistanceKm;
      }

      if (right.totalDistanceKm !== left.totalDistanceKm) {
        return right.totalDistanceKm - left.totalDistanceKm;
      }

      if (right.participants !== left.participants) {
        return right.participants - left.participants;
      }

      return left.name.localeCompare(right.name, 'ko');
    })
    .map((child, index) => ({
      ...child,
      rank: index + 1,
    }));
}

function findRegionPath(node, targetId) {
  if (node.id === targetId) {
    return [node];
  }

  for (const child of node.children ?? []) {
    const childPath = findRegionPath(child, targetId);

    if (childPath) {
      return [node, ...childPath];
    }
  }

  return null;
}

function buildDistrictPersonal(users, currentUser, metricsByUserId) {
  const ranks = [...users]
    .sort((left, right) => compareDistrictRank(left, right, metricsByUserId))
    .map((user, index) => buildDistrictRank(user, index + 1, currentUser.id, metricsByUserId.get(user.id)));
  const myRank = ranks.find((entry) => entry.id === currentUser.id) ?? null;
  const myRankIndex = myRank ? ranks.findIndex((entry) => entry.id === currentUser.id) : -1;
  const focusStart = Math.max(0, myRankIndex - 1);
  const focusRanks = myRankIndex >= 0 ? ranks.slice(focusStart, focusStart + 4) : ranks.slice(0, 4);
  const myMetrics = metricsByUserId.get(currentUser.id);

  return {
    districtName: currentUser.districtName,
    myRank,
    myPoints: myMetrics?.currentWeekPoints ?? 0,
    weeklyDistanceKm: myMetrics?.currentWeekDistanceKm ?? 0,
    focusRanks,
    ranks,
  };
}

function buildRegionLeague(regionTree, nodeId, createError) {
  const path = nodeId ? findRegionPath(regionTree, nodeId) : [regionTree];

  if (!path) {
    throw createError(404, '선택한 지역 정보를 찾을 수 없어.');
  }

  const rawCurrentNode = path[path.length - 1];
  const parentNode = path[path.length - 2] ?? null;
  const normalizedSiblings = parentNode ? normalizeRegionChildren(parentNode.children ?? []) : [rawCurrentNode];
  const currentNode = normalizedSiblings.find((child) => child.id === rawCurrentNode.id) ?? rawCurrentNode;
  const children = normalizeRegionChildren(currentNode.children ?? []);

  return {
    currentNode,
    breadcrumb: path.map(({ id, name, level }) => ({ id, name, level })),
    children,
  };
}

function buildUniversityLeague(users, metricsByUserId) {
  const universityMap = new Map();

  for (const user of users) {
    const universityName = normalizeOptionalString(user.universityName);

    if (!universityName) {
      continue;
    }

    const current = universityMap.get(universityName) ?? {
      universityName,
      totalDistanceKm: 0,
      participants: 0,
    };
    const metrics = metricsByUserId.get(user.id);

    current.totalDistanceKm = Number((current.totalDistanceKm + (metrics?.currentWeekDistanceKm ?? 0)).toFixed(1));
    current.participants += 1;
    universityMap.set(universityName, current);
  }

  const ranks = [...universityMap.values()]
    .map((entry) => ({
      ...entry,
      averageDistanceKm: Number((entry.totalDistanceKm / Math.max(entry.participants, 1)).toFixed(1)),
    }))
    .sort((left, right) => {
      if (right.averageDistanceKm !== left.averageDistanceKm) {
        return right.averageDistanceKm - left.averageDistanceKm;
      }

      if (right.totalDistanceKm !== left.totalDistanceKm) {
        return right.totalDistanceKm - left.totalDistanceKm;
      }

      if (right.participants !== left.participants) {
        return right.participants - left.participants;
      }

      return left.universityName.localeCompare(right.universityName, 'ko');
    })
    .map((entry, index) => ({
      rank: index + 1,
      universityName: entry.universityName,
      totalDistanceKm: Number(entry.totalDistanceKm.toFixed(1)),
      participants: entry.participants,
      averageDistanceKm: entry.averageDistanceKm,
    }));

  return { ranks };
}

export function createPostgresLeagueRepository({
  database,
  buildUserMetrics,
  createError,
  defaultRegionTree = null,
}) {
  if (!database || typeof database.query !== 'function') {
    throw new Error('createPostgresLeagueRepository requires a database query adapter.');
  }

  if (typeof buildUserMetrics !== 'function') {
    throw new Error('createPostgresLeagueRepository requires a buildUserMetrics function.');
  }

  return {
    async getDistrictPersonalByUserId({ currentUserId }) {
      const currentUser = await findUserById(database, currentUserId, createError);
      const users = await loadUsersByRegion(database, currentUser);
      const userIds = users.map((user) => user.id);
      const runsByUserId = await loadRunsByUserIds(database, userIds);
      const metricsByUserId = buildMetricsByUserId(runsByUserId, userIds, buildUserMetrics);

      return buildDistrictPersonal(users, currentUser, metricsByUserId);
    },

    async getDistrictPersonal({ token }) {
      const currentUser = await requireUserByToken(database, token, createError);
      return this.getDistrictPersonalByUserId({
        currentUserId: currentUser.id,
      });
    },

    async getRegionsByUserId({ currentUserId, nodeId }) {
      await findUserById(database, currentUserId, createError);
      const regionTree = await loadRegionTree(database, defaultRegionTree);
      return buildRegionLeague(regionTree, nodeId, createError);
    },

    async getRegions({ token, nodeId }) {
      const currentUser = await requireUserByToken(database, token, createError);
      return this.getRegionsByUserId({
        currentUserId: currentUser.id,
        nodeId,
      });
    },

    async getUniversitiesByUserId({ currentUserId }) {
      await findUserById(database, currentUserId, createError);
      const users = await loadUsersWithUniversity(database);
      const userIds = users.map((user) => user.id);
      const runsByUserId = await loadRunsByUserIds(database, userIds);
      const metricsByUserId = buildMetricsByUserId(runsByUserId, userIds, buildUserMetrics);

      return buildUniversityLeague(users, metricsByUserId);
    },

    async getUniversities({ token }) {
      const currentUser = await requireUserByToken(database, token, createError);
      return this.getUniversitiesByUserId({
        currentUserId: currentUser.id,
      });
    },
  };
}
