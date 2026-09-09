import {
  buildTodayRanking,
  isTodayRankingCategory,
} from '../services/todayRankingBuilder.mjs';
import { ensureUserRankState } from '../lib/userStoreHelpers.mjs';
import { LP_PER_TIER, RANK_TIERS } from '../lib/rankSystem.mjs';

// Region drill is capped at three levels (country -> province -> city); city
// (시/군) nodes and anything below are treated as leaves.
const REGION_LEAF_LEVELS = new Set(['city', 'district']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isRegionLeafLevel(level) {
  return REGION_LEAF_LEVELS.has(level);
}

function getUserRankScore(user) {
  const rankState = ensureUserRankState(user);
  const tierIndex = Math.max(0, RANK_TIERS.indexOf(rankState.tier));
  return tierIndex * LP_PER_TIER + rankState.lp;
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
    ...(row.rank_state ? { rankState: clone(row.rank_state) } : {}),
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
    ...(row.match_result ? { matchResult: clone(row.match_result) } : {}),
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
    throw createError(401, '세션이 만료됐어요. 다시 로그인해주세요.');
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
    throw createError(404, '사용자를 찾을 수 없어요.');
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

// Everyone in the same 시/군 rolls up together regardless of their stored 구/동.
async function loadUsersByCity(database, provinceName, cityName) {
  const result = await database.query(
    `
      select *
      from users
      where coalesce(province_name, '') = $1
        and coalesce(city_name, '') = $2
    `,
    [provinceName ?? '', cityName ?? ''],
  );

  return result.rows.map(mapUserRow);
}

// 광역시 구 (district directly under a province — no city level). The city=''
// clause mirrors how those users are stored, and province+district together
// disambiguate the 구 names that repeat across metros (동구/중구/서구...).
async function loadUsersByProvinceAndDistrict(database, provinceName, districtName) {
  const result = await database.query(
    `
      select *
      from users
      where coalesce(province_name, '') = $1
        and coalesce(city_name, '') = ''
        and coalesce(district_name, '') = $2
    `,
    [provinceName ?? '', districtName ?? ''],
  );

  return result.rows.map(mapUserRow);
}

async function loadUsersByProvince(database, provinceName) {
  const result = await database.query(
    `
      select *
      from users
      where coalesce(province_name, '') = $1
    `,
    [provinceName ?? ''],
  );

  return result.rows.map(mapUserRow);
}

async function loadAllUsers(database) {
  const result = await database.query(
    `
      select *
      from users
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
             route, match_result, duration_seconds, cadence_spm, cadence_audit, elevation_gain_m, started_at, ended_at,
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
    // Competitive district ranking: rank by AND show the competitive weekly
    // distance (imports excluded) so the shown number matches the sort key.
    distanceKm: metrics.currentWeekDistanceKm,
    points: metrics.currentWeekPoints,
    rankScore: getUserRankScore(user),
    monthlyDistanceKm: metrics.currentMonthDistanceKm,
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

function buildDistrictPersonal(users, currentUser, metricsByUserId, regionName) {
  const ranks = [...users]
    .sort((left, right) => compareDistrictRank(left, right, metricsByUserId))
    .map((user, index) => buildDistrictRank(user, index + 1, currentUser.id, metricsByUserId.get(user.id)));
  const myRank = ranks.find((entry) => entry.id === currentUser.id) ?? null;
  const myRankIndex = myRank ? ranks.findIndex((entry) => entry.id === currentUser.id) : -1;
  const focusStart = Math.max(0, myRankIndex - 1);
  const focusRanks = myRankIndex >= 0 ? ranks.slice(focusStart, focusStart + 4) : ranks.slice(0, 4);
  const myMetrics = metricsByUserId.get(currentUser.id);

  return {
    districtName: regionName ?? currentUser.districtName,
    myRank,
    myPoints: myMetrics?.currentWeekPoints ?? 0,
    // Header "my weekly distance" on the competitive district board must match
    // my ranked distance, so it uses the competitive value (imports excluded).
    weeklyDistanceKm: myMetrics?.currentWeekDistanceKm ?? 0,
    focusRanks,
    ranks,
  };
}

// Cap the drill path at the city level so the breadcrumb never exceeds three
// levels even if a deeper node is targeted.
function capRegionPathDepth(path) {
  const leafIndex = path.findIndex((node) => isRegionLeafLevel(node.level));

  if (leafIndex === -1) {
    return path;
  }

  return path.slice(0, leafIndex + 1);
}

function buildRegionLeague(regionTree, nodeId, createError) {
  const rawPath = nodeId ? findRegionPath(regionTree, nodeId) : [regionTree];

  if (!rawPath) {
    throw createError(404, '선택한 지역 정보를 찾을 수 없어요.');
  }

  const path = capRegionPathDepth(rawPath);
  const rawCurrentNode = path[path.length - 1];
  const parentNode = path[path.length - 2] ?? null;
  const normalizedSiblings = parentNode ? normalizeRegionChildren(parentNode.children ?? []) : [rawCurrentNode];
  const currentNode = normalizedSiblings.find((child) => child.id === rawCurrentNode.id) ?? rawCurrentNode;
  // City (시/군) nodes are leaves; never expose their 구/동 children.
  const children = isRegionLeafLevel(currentNode.level)
    ? []
    : normalizeRegionChildren(currentNode.children ?? []);

  return {
    currentNode,
    breadcrumb: path.map(({ id, name, level }) => ({ id, name, level })),
    children,
  };
}

// Resolve which set of users a district-personal listing targets. With a city
// nodeId we aggregate the whole 시/군; otherwise we use the requesting user's
// own region.
async function resolveDistrictPersonalUsers(database, currentUser, nodeId, defaultRegionTree) {
  if (nodeId) {
    const regionTree = await loadRegionTree(database, defaultRegionTree);
    const path = findRegionPath(regionTree, nodeId);

    if (path) {
      const targetNode = path[path.length - 1] ?? null;
      const provinceNode = path.find((entry) => entry.level === 'province') ?? null;
      const cityNode = path.find((entry) => entry.level === 'city') ?? null;

      if (cityNode && provinceNode) {
        return {
          regionName: cityNode.name,
          users: await loadUsersByCity(database, provinceNode.name, cityNode.name),
        };
      }

      // 광역시 구: no city level in the path. Without this branch the lookup
      // silently fell back to the REQUESTER's own region, so every metro 구
      // showed the same member board (mirrors leagueRepository.mjs).
      if (provinceNode && targetNode?.level === 'district') {
        return {
          regionName: targetNode.name,
          users: await loadUsersByProvinceAndDistrict(database, provinceNode.name, targetNode.name),
        };
      }

      if (targetNode?.level === 'province') {
        return {
          regionName: targetNode.name,
          users: await loadUsersByProvince(database, targetNode.name),
        };
      }
    }
  }

  return {
    regionName: currentUser.districtName,
    users: await loadUsersByRegion(database, currentUser),
  };
}

function requireTodayRankingCategory(category, createError) {
  if (!isTodayRankingCategory(category)) {
    throw createError(400, '오늘의 랭킹 카테고리가 올바르지 않아요.');
  }

  return category;
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
    async getDistrictPersonalByUserId({ currentUserId, nodeId }) {
      const currentUser = await findUserById(database, currentUserId, createError);
      const { regionName, users } = await resolveDistrictPersonalUsers(
        database,
        currentUser,
        nodeId,
        defaultRegionTree,
      );
      const userIds = users.map((user) => user.id);
      const runsByUserId = await loadRunsByUserIds(database, userIds);
      const metricsByUserId = buildMetricsByUserId(runsByUserId, userIds, buildUserMetrics);

      return buildDistrictPersonal(users, currentUser, metricsByUserId, regionName);
    },

    async getDistrictPersonal({ token, nodeId }) {
      const currentUser = await requireUserByToken(database, token, createError);
      return this.getDistrictPersonalByUserId({
        currentUserId: currentUser.id,
        nodeId,
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

    async getTodayRankingsByUserId({ currentUserId, category }) {
      await findUserById(database, currentUserId, createError);
      const safeCategory = requireTodayRankingCategory(category, createError);
      const users = await loadAllUsers(database);
      const userIds = users.map((user) => user.id);
      const runsByUserId = await loadRunsByUserIds(database, userIds);

      return buildTodayRanking({
        category: safeCategory,
        currentUserId,
        buildUserMetrics,
        runsByUserId,
        users,
      });
    },

    async getTodayRankings({ token, category }) {
      const currentUser = await requireUserByToken(database, token, createError);
      return this.getTodayRankingsByUserId({
        category,
        currentUserId: currentUser.id,
      });
    },
  };
}
