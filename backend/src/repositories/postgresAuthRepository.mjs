import { buildSessionExpiry, hashPassword, verifyPassword } from '../auth.mjs';
import { createDefaultConnectedSources, createDefaultNotificationSettings } from './authRepository.mjs';

const PUBLIC_TAG_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PUBLIC_TAG_MAX_ATTEMPTS = 50;

function createDefaultPublicTag() {
  let suffix = '';

  for (let index = 0; index < 5; index += 1) {
    suffix += PUBLIC_TAG_ALPHABET[Math.floor(Math.random() * PUBLIC_TAG_ALPHABET.length)];
  }

  return `#${suffix}`;
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
    passwordHash: row.password_hash,
    passwordUpdatedAt: toIsoString(row.password_updated_at),
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
    externalId: row.external_id ?? '',
  };
}

function isUniqueViolation(error, constraintName) {
  return error?.code === '23505' && (
    error.constraint === constraintName || String(error.message ?? '').includes(constraintName)
  );
}

async function findUserByUsername(database, username) {
  const result = await database.query(
    `
      select *
      from users
      where username = $1
      limit 1
    `,
    [username],
  );

  return result.rows[0] ? mapUserRow(result.rows[0]) : null;
}

async function loadProfileStore(database, userId) {
  const result = await database.query(
    `
      select id, user_id, run_date, distance_km, pace, source_label, source_type, external_id
      from runs
      where user_id = $1
      order by run_date desc
    `,
    [userId],
  );

  return {
    users: [],
    sessions: [],
    runs: result.rows.map(mapRunRow),
    marketCatalog: [],
    rewardRedemptions: [],
  };
}

async function createSessionForUser(database, {
  userId,
  createToken,
  sessionTtlMs,
}) {
  const createdAt = new Date();
  const token = createToken();

  await database.query(
    `
      insert into sessions (token, user_id, created_at, expires_at)
      values ($1, $2, $3, $4)
    `,
    [token, userId, createdAt.toISOString(), buildSessionExpiry(sessionTtlMs, createdAt)],
  );

  return token;
}

async function createAvailablePublicTag(database, createPublicTag, createError) {
  for (let attempt = 0; attempt < PUBLIC_TAG_MAX_ATTEMPTS; attempt += 1) {
    const publicTag = createPublicTag();
    const result = await database.query(
      `
        select 1
        from users
        where public_tag = $1
        limit 1
      `,
      [publicTag],
    );

    if (!result.rows[0]) {
      return publicTag;
    }
  }

  throw createError(500, '친구 태그를 만드는 중 문제가 생겼어요. 다시 시도해주세요.');
}

async function runWriteOperation(database, callback) {
  if (typeof database.transaction === 'function') {
    return database.transaction(callback);
  }

  return callback(database);
}

export function createPostgresAuthRepository({
  database,
  sessionTtlMs,
  createToken,
  nextId,
  buildProfile,
  createError,
  createPublicTag = createDefaultPublicTag,
}) {
  if (!database || typeof database.query !== 'function') {
    throw new Error('createPostgresAuthRepository requires a database query adapter.');
  }

  return {
    async checkUsername(username) {
      const result = await database.query(
        `
          select id
          from users
          where username = $1
          limit 1
        `,
        [username],
      );
      const available = !result.rows[0];

      return {
        username,
        available,
        message: available ? '사용할 수 있는 아이디예요.' : '이미 사용 중인 아이디예요.',
      };
    },

    async login({ username, password }) {
      return runWriteOperation(database, async (client) => {
        const user = await findUserByUsername(client, username);

        if (!user || !verifyPassword(password, user.passwordHash)) {
          throw createError(401, '아이디 또는 비밀번호가 맞지 않아요.');
        }

        const accessToken = await createSessionForUser(client, {
          userId: user.id,
          createToken,
          sessionTtlMs,
        });
        const profileStore = await loadProfileStore(client, user.id);

        return {
          accessToken,
          user: buildProfile(profileStore, user),
        };
      });
    },

    async logout({ token }) {
      await database.query(
        `
          delete from sessions
          where token = $1
        `,
        [token],
      );

      return {
        success: true,
      };
    },

    async register({
      username,
      password,
      name,
      realName,
      phone,
      birthDate,
      region,
      universityName,
      addressDetail,
    }) {
      return runWriteOperation(database, async (client) => {
        const existingUser = await findUserByUsername(client, username);

        if (existingUser) {
          throw createError(409, '이미 사용 중인 아이디예요.');
        }

        const createdAt = new Date().toISOString();
        const user = {
          id: nextId('user'),
          username,
          passwordHash: hashPassword(password),
          passwordUpdatedAt: createdAt,
          name,
          realName,
          phone,
          birthDate,
          provinceName: region.provinceName,
          cityName: region.cityName,
          districtName: region.districtName,
          universityName: universityName || '',
          addressDetail,
          publicTag: await createAvailablePublicTag(client, createPublicTag, createError),
          rewardPoints: 0,
          streakDays: 0,
          connectedSources: createDefaultConnectedSources(),
          notificationSettings: createDefaultNotificationSettings(),
          createdAt,
          updatedAt: createdAt,
        };

        try {
          await client.query(
            `
              insert into users (
                id, username, password_hash, password_updated_at, nickname, real_name, phone, birth_date,
                public_tag, province_name, city_name, district_name, university_name, address_detail,
                reward_points, streak_days, connected_sources, notification_settings, created_at, updated_at
              )
              values (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13, $14,
                $15, $16, $17, $18, $19, $20
              )
            `,
            [
              user.id,
              user.username,
              user.passwordHash,
              user.passwordUpdatedAt,
              user.name,
              user.realName,
              user.phone,
              user.birthDate,
              user.publicTag,
              user.provinceName,
              user.cityName,
              user.districtName,
              user.universityName || null,
              user.addressDetail,
              user.rewardPoints,
              user.streakDays,
              user.connectedSources,
              user.notificationSettings,
              user.createdAt,
              user.updatedAt,
            ],
          );
        } catch (error) {
          if (isUniqueViolation(error, 'users_username_unique_idx')) {
            throw createError(409, '이미 사용 중인 아이디예요.');
          }

          if (isUniqueViolation(error, 'users_public_tag_unique_idx')) {
            throw createError(500, '친구 태그를 만드는 중 문제가 생겼어요. 다시 시도해주세요.');
          }

          throw error;
        }

        const accessToken = await createSessionForUser(client, {
          userId: user.id,
          createToken,
          sessionTtlMs,
        });
        const profileStore = await loadProfileStore(client, user.id);

        return {
          accessToken,
          user: buildProfile(profileStore, user),
        };
      });
    },
  };
}
