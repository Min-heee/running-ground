import { buildSessionExpiry, setUserPassword, verifyPassword } from '../auth.mjs';

export function createDefaultConnectedSources() {
  return [
    {
      sourceType: 'manual',
      displayName: 'Manual',
      connected: false,
      connectionStatus: 'planned',
      recommendedPlatform: 'all',
    },
    {
      sourceType: 'apple_health',
      displayName: 'Apple Health',
      connected: false,
      connectionStatus: 'planned',
      recommendedPlatform: 'ios',
    },
    {
      sourceType: 'health_connect',
      displayName: 'Health Connect',
      connected: false,
      connectionStatus: 'planned',
      recommendedPlatform: 'android',
    },
    {
      sourceType: 'garmin',
      displayName: 'Garmin',
      connected: false,
      connectionStatus: 'planned',
      recommendedPlatform: 'all',
    },
    {
      sourceType: 'strava',
      displayName: 'Strava',
      connected: false,
      connectionStatus: 'planned',
      recommendedPlatform: 'all',
    },
    {
      sourceType: 'nrc',
      displayName: 'Nike Run Club',
      connected: false,
      connectionStatus: 'planned',
      recommendedPlatform: 'all',
    },
  ];
}

export function createDefaultNotificationSettings() {
  return {
    friendAlerts: true,
    districtAlerts: true,
    marketAlerts: false,
  };
}

function createPublicTag(store) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let nextTag = '#TEMP1';

  do {
    let suffix = '';

    for (let index = 0; index < 5; index += 1) {
      suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    }

    nextTag = `#${suffix}`;
  } while (store.users.some((entry) => entry.publicTag === nextTag));

  return nextTag;
}

export function createStarterRuns() {
  return [];
}

function createSessionForUser(store, {
  userId,
  createToken,
  sessionTtlMs,
}) {
  const createdAt = new Date();
  const token = createToken();
  store.sessions.push({
    token,
    userId,
    createdAt: createdAt.toISOString(),
    expiresAt: buildSessionExpiry(sessionTtlMs, createdAt),
  });

  return token;
}

export function createJsonAuthRepository({
  loadStore,
  mutateStore,
  sessionTtlMs,
  createToken,
  nextId,
  buildProfile,
  createError,
}) {
  return {
    checkUsername(username) {
      const store = loadStore();
      const available = !store.users.some((entry) => entry.username === username);

      return {
        username,
        available,
        message: available ? '사용할 수 있는 아이디예요.' : '이미 사용 중인 아이디예요.',
      };
    },

    login({ username, password }) {
      return mutateStore((store) => {
        const user = store.users.find((entry) => entry.username === username);

        if (!user || !verifyPassword(password, user.passwordHash ?? user.password)) {
          throw createError(401, '아이디 또는 비밀번호가 맞지 않아요.');
        }

        const accessToken = createSessionForUser(store, {
          userId: user.id,
          createToken,
          sessionTtlMs,
        });

        return {
          accessToken,
          user: buildProfile(store, user),
        };
      });
    },

    logout({ token }) {
      return mutateStore((store) => {
        const existingSessionIndex = store.sessions.findIndex((entry) => entry.token === token);

        if (existingSessionIndex >= 0) {
          store.sessions.splice(existingSessionIndex, 1);
        }

        return {
          success: true,
        };
      });
    },

    register({
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
      return mutateStore((store) => {
        if (store.users.some((entry) => entry.username === username)) {
          throw createError(409, '이미 사용 중인 아이디예요.');
        }

        const userId = nextId('user');
        const starterRuns = createStarterRuns(userId);
        const user = {
          id: userId,
          username,
          name,
          realName,
          phone,
          birthDate,
          provinceName: region.provinceName,
          cityName: region.cityName,
          districtName: region.districtName,
          ...(universityName ? { universityName } : {}),
          addressDetail,
          publicTag: createPublicTag(store),
          friendDistanceKm: 0,
          friendPoints: 0,
          districtDistanceKm: 0,
          districtPoints: 0,
          rewardPoints: 0,
          streakDays: 0,
          connectedSources: createDefaultConnectedSources(),
          notificationSettings: createDefaultNotificationSettings(),
          createdAt: new Date().toISOString(),
        };

        setUserPassword(user, password, user.createdAt);

        store.users.push(user);
        store.runs.push(...starterRuns);
        const accessToken = createSessionForUser(store, {
          userId: user.id,
          createToken,
          sessionTtlMs,
        });

        return {
          accessToken,
          user: buildProfile(store, user),
        };
      });
    },
  };
}
