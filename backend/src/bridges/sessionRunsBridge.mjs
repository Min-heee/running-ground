import { isSessionExpired } from '../auth.mjs';
import { buildUserRunMetrics } from '../points.mjs';
import {
  DIVISIONS_PER_TIER,
  INITIAL_RANK,
  LP_PER_DIVISION,
  RANK_TIERS,
} from '../lib/rankSystem.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
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

function asRankState(value) {
  const rankState = asObject(value);

  if (
    !RANK_TIERS.includes(rankState.tier)
    || !Number.isInteger(rankState.division)
    || rankState.division < 1
    || rankState.division > DIVISIONS_PER_TIER
    || !Number.isFinite(rankState.lp)
    || rankState.lp < 0
    || rankState.lp > LP_PER_DIVISION
  ) {
    return { ...INITIAL_RANK };
  }

  return {
    tier: rankState.tier,
    division: rankState.division,
    lp: rankState.lp,
  };
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
    rankState: asRankState(row.rank_state),
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

function findJsonUserByToken(store, token, createError) {
  const session = store.sessions.find((entry) => entry.token === token);

  if (!session || isSessionExpired(session)) {
    throw createError(401, '세션이 만료됐어. 다시 로그인해줘.');
  }

  const user = store.users.find((entry) => entry.id === session.userId);

  if (!user) {
    throw createError(401, '세션 사용자를 찾을 수 없어.');
  }

  return user;
}

function findJsonUserById(store, userId, createError) {
  const user = store.users.find((entry) => entry.id === userId);

  if (!user) {
    throw createError(404, '사용자를 찾을 수 없어.');
  }

  return user;
}

function getJsonRunsForUser(store, userId) {
  return store.runs
    .filter((entry) => entry.userId === userId)
    .sort((left, right) => right.date.localeCompare(left.date));
}

function assertDatabase(database, featureName) {
  if (!database || typeof database.query !== 'function') {
    throw new Error(`${featureName} requires a PostgreSQL database adapter.`);
  }
}

export function createSessionRunsBridge({
  database = null,
  sessionReadsEnabled = false,
  runReadsEnabled = false,
  createError,
  buildMetrics = buildUserRunMetrics,
}) {
  if (typeof createError !== 'function') {
    throw new Error('createSessionRunsBridge requires a createError function.');
  }

  const metricsCacheByStore = new WeakMap();

  function getCachedJsonMetrics(store, userId) {
    let metricsByUserId = metricsCacheByStore.get(store);

    if (!metricsByUserId) {
      metricsByUserId = new Map();
      metricsCacheByStore.set(store, metricsByUserId);
    }

    if (!metricsByUserId.has(userId)) {
      metricsByUserId.set(userId, buildMetrics(getJsonRunsForUser(store, userId)));
    }

    return metricsByUserId.get(userId);
  }

  async function findPostgresUserByToken(token) {
    assertDatabase(database, 'sessionReadsEnabled');
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

    return result.rows[0] ? mapUserRow(result.rows[0]) : null;
  }

  async function findPostgresUserById(userId) {
    assertDatabase(database, 'sessionReadsEnabled');
    const result = await database.query(
      `
        select *
        from users
        where id = $1
        limit 1
      `,
      [userId],
    );

    return result.rows[0] ? mapUserRow(result.rows[0]) : null;
  }

  async function loadPostgresRunsForUser(userId) {
    assertDatabase(database, 'runReadsEnabled');
    const result = await database.query(
      `
        select id, user_id, run_date, distance_km, pace, source_label, source_type, external_id,
               route, duration_seconds, cadence_spm, elevation_gain_m, started_at, ended_at,
               imported_at, created_at, updated_at
        from runs
        where user_id = $1
        order by run_date desc, created_at desc
      `,
      [userId],
    );

    return result.rows.map(mapRunRow);
  }

  return {
    getConfig() {
      return {
        sessionReadsEnabled,
        runReadsEnabled,
        postgresConfigured: Boolean(database && typeof database.query === 'function'),
      };
    },

    async findUserByToken({ store, token, fallbackToJson = true }) {
      if (sessionReadsEnabled) {
        const user = await findPostgresUserByToken(token);

        if (user) {
          return {
            user,
            source: 'postgres',
          };
        }
      }

      if (!fallbackToJson) {
        throw createError(401, '세션이 만료됐어. 다시 로그인해줘.');
      }

      return {
        user: findJsonUserByToken(store, token, createError),
        source: 'json',
      };
    },

    async findUserById({ store, userId, fallbackToJson = true }) {
      if (sessionReadsEnabled) {
        const user = await findPostgresUserById(userId);

        if (user) {
          return {
            user,
            source: 'postgres',
          };
        }
      }

      if (!fallbackToJson) {
        throw createError(404, '사용자를 찾을 수 없어.');
      }

      return {
        user: findJsonUserById(store, userId, createError),
        source: 'json',
      };
    },

    async getRunsForUser({ store, userId, fallbackToJsonIfEmpty = true }) {
      if (runReadsEnabled) {
        const runs = await loadPostgresRunsForUser(userId);

        if (runs.length > 0 || !fallbackToJsonIfEmpty) {
          return {
            runs,
            source: 'postgres',
          };
        }
      }

      return {
        runs: getJsonRunsForUser(store, userId),
        source: 'json',
      };
    },

    async getUserMetrics({ store, userId, fallbackToJsonIfEmpty = true }) {
      const runResult = await this.getRunsForUser({
        store,
        userId,
        fallbackToJsonIfEmpty,
      });

      if (runResult.source === 'json') {
        return {
          metrics: getCachedJsonMetrics(store, userId),
          source: 'json',
        };
      }

      return {
        metrics: buildMetrics(runResult.runs),
        source: 'postgres',
      };
    },
  };
}
