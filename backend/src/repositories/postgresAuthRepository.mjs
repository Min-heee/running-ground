import { buildSessionExpiry, hashPassword, verifyPassword } from '../auth.mjs';
import {
  INITIAL_RANK,
  RANK_TIERS,
} from '../lib/rankSystem.mjs';
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

function asRankState(value) {
  const rankState = asObject(value);

  if (
    !RANK_TIERS.includes(rankState.tier)
    || 'division' in rankState
    || !Number.isFinite(rankState.lp)
    || rankState.lp < 0
  ) {
    return { ...INITIAL_RANK };
  }

  return {
    tier: rankState.tier,
    lp: Math.trunc(rankState.lp),
  };
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

async function findUserByIdentity(database, { realName, phone, birthDate }) {
  const result = await database.query(
    `
      select *
      from users
      where real_name = $1 and phone = $2 and birth_date = $3
      limit 1
    `,
    [realName, phone, birthDate],
  );

  return result.rows[0] ? mapUserRow(result.rows[0]) : null;
}

function maskPhone(phone) {
  return `${phone.slice(0, 3)}-****-${phone.slice(-4)}`;
}

async function findUserBySessionToken(database, token) {
  const result = await database.query(
    `
      select users.*
      from sessions
      join users on users.id = sessions.user_id
      where sessions.token = $1
      limit 1
    `,
    [token],
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

async function removeLiveRunShare(client, userId) {
  const result = await client.query(
    `
      select value
      from app_metadata
      where key = $1
      limit 1
    `,
    ['live_run_shares'],
  );

  const liveRunShares = result.rows[0]?.value && typeof result.rows[0].value === 'object' && !Array.isArray(result.rows[0].value)
    ? { ...result.rows[0].value }
    : {};

  if (!Object.prototype.hasOwnProperty.call(liveRunShares, userId)) {
    return;
  }

  delete liveRunShares[userId];
  await client.query(
    `
      insert into app_metadata (key, value, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (key)
      do update set
        value = excluded.value,
        updated_at = now()
    `,
    ['live_run_shares', JSON.stringify(liveRunShares)],
  );
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

    async findUsername({ realName, phone, birthDate }) {
      const user = await findUserByIdentity(database, { realName, phone, birthDate });

      if (!user) {
        throw createError(404, '일치하는 계정을 찾지 못했어요.');
      }

      return {
        success: true,
        username: user.username,
        maskedPhone: maskPhone(user.phone),
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

    async deleteAccount({ token }) {
      return runWriteOperation(database, async (client) => {
        const user = await findUserBySessionToken(client, token);

        if (!user) {
          throw createError(401, '로그인이 필요해요.');
        }

        await removeLiveRunShare(client, user.id);

        await client.query(
          `
            delete from users
            where id = $1
          `,
          [user.id],
        );

        return {
          success: true,
          deletedUserId: user.id,
        };
      });
    },

    async resetPassword({ username, realName, phone, birthDate, newPassword }) {
      return runWriteOperation(database, async (client) => {
        const result = await client.query(
          `
            select *
            from users
            where username = $1 and real_name = $2 and phone = $3 and birth_date = $4
            limit 1
          `,
          [username, realName, phone, birthDate],
        );

        if (!result.rows[0]) {
          throw createError(404, '입력한 정보와 일치하는 계정을 찾지 못했어요.');
        }

        const user = mapUserRow(result.rows[0]);
        const updatedAt = new Date().toISOString();

        await client.query(
          `
            update users
            set password_hash = $2, password_updated_at = $3, updated_at = $3
            where id = $1
          `,
          [user.id, hashPassword(newPassword), updatedAt],
        );

        await client.query(
          `
            delete from sessions
            where user_id = $1
          `,
          [user.id],
        );

        return {
          success: true,
          username: user.username,
          message: '비밀번호를 새로 바꿨어요. 이제 새 비밀번호로 로그인해주세요.',
        };
      });
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
          rankState: { ...INITIAL_RANK },
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
                reward_points, streak_days, rank_state, connected_sources, notification_settings, created_at, updated_at
              )
              values (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13, $14,
                $15, $16, $17, $18, $19, $20, $21
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
              user.rankState,
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
