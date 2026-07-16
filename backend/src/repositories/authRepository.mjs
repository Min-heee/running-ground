import { buildSessionExpiry, setUserPassword, verifyPassword } from '../auth.mjs';
import { INITIAL_RANK } from '../lib/rankSystem.mjs';
import { SOCIAL_PROVIDER_LABEL } from '../lib/socialAuthProviders.mjs';

function createSocialUsername(store, provider) {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  let username = '';

  do {
    let suffix = '';
    for (let index = 0; index < 8; index += 1) {
      suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    username = `${provider}_${suffix}`;
  } while (store.users.some((entry) => entry.username === username));

  return username;
}

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
    matchReminders: true,
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
  // Single active session per user ("newest login wins"): a new login (password or
  // social) invalidates any other device's existing session, so the previous device's
  // next authenticated request gets 401 and the client signs out.
  store.sessions = (store.sessions ?? []).filter((entry) => entry.userId !== userId);

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

function findUserBySessionToken(store, token) {
  const session = store.sessions.find((entry) => entry.token === token);

  if (!session) {
    return null;
  }

  const user = store.users.find((entry) => entry.id === session.userId);

  if (!user) {
    return null;
  }

  return {
    session,
    user,
  };
}

function maskPhone(phone) {
  return `${phone.slice(0, 3)}-****-${phone.slice(-4)}`;
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
    async checkUsername(username) {
      const store = await loadStore();
      const available = !store.users.some((entry) => entry.username === username);

      return {
        username,
        available,
        message: available ? '사용할 수 있는 아이디예요.' : '이미 사용 중인 아이디예요.',
      };
    },

    async findUsername({ realName, phone, phoneVerificationToken }) {
      return mutateStore((store) => {
        // Apple 5.1.1(v): identity is realName + phone + a verified 'find_username' phone-OTP
        // challenge (no 생년월일). Require a still-valid verified challenge for THIS number and
        // consume it — mirrors register()/resetPassword() so the token can't be replayed. Phone
        // is unique per account, so realName+phone resolves to at most one user.
        const phoneChallenge = (store.phoneVerificationChallenges ?? []).find((entry) => (
          entry.purpose === 'find_username'
          && entry.status === 'verified'
          && entry.verifiedToken === phoneVerificationToken
          && String(entry.phone ?? '').replace(/\D/g, '') === phone
        ));

        if (
          !phoneChallenge
          || !phoneChallenge.registrationExpiresAt
          || Date.parse(phoneChallenge.registrationExpiresAt) <= Date.now()
        ) {
          throw createError(400, '휴대폰 인증을 먼저 완료해주세요.');
        }

        const user = store.users.find((entry) => (
          entry.realName === realName
          && entry.phone === phone
        ));

        if (!user) {
          throw createError(404, '일치하는 계정을 찾지 못했어요.');
        }

        // Consume the verified challenge so its token can't be reused for another lookup.
        phoneChallenge.status = 'consumed';
        phoneChallenge.consumedAt = new Date().toISOString();

        return {
          success: true,
          username: user.username,
          maskedPhone: maskPhone(user.phone),
        };
      });
    },

    async login({ username, password }) {
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

    async logout({ token }) {
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

    async deleteAccount({ token }) {
      return mutateStore((store) => {
        const sessionUser = findUserBySessionToken(store, token);

        if (!sessionUser) {
          throw createError(401, '로그인이 필요해요.');
        }

        const { user } = sessionUser;

        store.users = store.users.filter((entry) => entry.id !== user.id);
        store.runs = (store.runs ?? []).filter((entry) => entry.userId !== user.id);
        store.sessions = (store.sessions ?? []).filter((entry) => entry.userId !== user.id);
        store.friendships = (store.friendships ?? []).filter((entry) => !entry.userIds.includes(user.id));
        store.friendRequests = (store.friendRequests ?? []).filter((entry) => entry.requesterId !== user.id && entry.receiverId !== user.id);
        store.rewardRedemptions = (store.rewardRedemptions ?? []).filter((entry) => entry.userId !== user.id);
        store.integrationImports = (store.integrationImports ?? []).filter((entry) => entry.userId !== user.id);
        store.liveRunShares = (store.liveRunShares ?? []).filter((entry) => entry.userId !== user.id);

        if (Array.isArray(store.offlineRaceEvents)) {
          for (const event of store.offlineRaceEvents) {
            event.registeredUserTags = (event.registeredUserTags ?? []).filter((tag) => tag !== user.publicTag);
          }
        }

        return {
          success: true,
          deletedUserId: user.id,
        };
      });
    },

    async resetPassword({ username, realName, phone, newPassword, phoneVerificationToken }) {
      return mutateStore((store) => {
        // P0-1: password reset now REQUIRES a still-valid verified 'reset' phone challenge for
        // this exact number — mirrors register()'s token consumption so a reset can only proceed
        // after the number's owner passed an OTP. The realName+username identity match below is
        // kept as an ADDITIONAL factor (defense in depth), not the sole gate. Apple 5.1.1(v):
        // 생년월일 is no longer part of the match.
        const phoneChallenge = (store.phoneVerificationChallenges ?? []).find((entry) => (
          entry.purpose === 'reset'
          && entry.status === 'verified'
          && entry.verifiedToken === phoneVerificationToken
          && String(entry.phone ?? '').replace(/\D/g, '') === phone
        ));

        if (
          !phoneChallenge
          || !phoneChallenge.registrationExpiresAt
          || Date.parse(phoneChallenge.registrationExpiresAt) <= Date.now()
        ) {
          throw createError(400, '휴대폰 인증을 먼저 완료해주세요.');
        }

        const user = store.users.find((entry) => (
          entry.username === username
          && entry.realName === realName
          && entry.phone === phone
        ));

        if (!user) {
          throw createError(404, '입력한 정보와 일치하는 계정을 찾지 못했어요.');
        }

        setUserPassword(user, newPassword);
        store.sessions = (store.sessions ?? []).filter((entry) => entry.userId !== user.id);

        // Consume the verified challenge so its token can't be reused for another reset.
        phoneChallenge.status = 'consumed';
        phoneChallenge.consumedAt = new Date().toISOString();

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
      addressDetail,
      phoneVerificationToken,
    }) {
      return mutateStore((store) => {
        // Require a still-valid verified phone challenge for this exact number. The client
        // obtains `phoneVerificationToken` from POST /auth/phone/verify-code; without it (or
        // once it expires) registration is refused — closing the unverified-signup hole.
        const phoneChallenge = (store.phoneVerificationChallenges ?? []).find((entry) => (
          entry.purpose === 'signup'
          && entry.status === 'verified'
          && entry.verifiedToken === phoneVerificationToken
          && String(entry.phone ?? '').replace(/\D/g, '') === phone
        ));

        if (
          !phoneChallenge
          || !phoneChallenge.registrationExpiresAt
          || Date.parse(phoneChallenge.registrationExpiresAt) <= Date.now()
        ) {
          throw createError(400, '휴대폰 인증을 먼저 완료해주세요.');
        }

        if (store.users.some((entry) => entry.username === username)) {
          throw createError(409, '이미 사용 중인 아이디예요.');
        }

        if (store.users.some((entry) => entry.phone === phone)) {
          throw createError(409, '이 번호로 이미 가입한 계정이 있어요. 로그인하거나 비밀번호 찾기를 이용해줘.');
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
          addressDetail,
          publicTag: createPublicTag(store),
          friendDistanceKm: 0,
          friendPoints: 0,
          districtDistanceKm: 0,
          districtPoints: 0,
          rewardPoints: 0,
          streakDays: 0,
          rankState: { ...INITIAL_RANK },
          connectedSources: createDefaultConnectedSources(),
          notificationSettings: createDefaultNotificationSettings(),
          createdAt: new Date().toISOString(),
        };

        setUserPassword(user, password, user.createdAt);

        store.users.push(user);
        store.runs.push(...starterRuns);

        // Consume the verified phone challenge so its token can't be reused for another signup.
        phoneChallenge.status = 'consumed';
        phoneChallenge.consumedAt = new Date().toISOString();

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

    async findOrCreateSocialUser({ provider, providerUserId, email, name }) {
      return mutateStore((store) => {
        const matched = store.users.find((entry) => Array.isArray(entry.socialAccounts)
          && entry.socialAccounts.some((account) => (
            account.provider === provider && account.providerUserId === providerUserId
          )));

        if (matched) {
          const accessToken = createSessionForUser(store, {
            userId: matched.id,
            createToken,
            sessionTtlMs,
          });

          return { accessToken, user: buildProfile(store, matched), isNewUser: false };
        }

        const userId = nextId('user');
        const trimmedName = typeof name === 'string' ? name.trim() : '';
        const user = {
          id: userId,
          username: createSocialUsername(store, provider),
          name: trimmedName || `${SOCIAL_PROVIDER_LABEL[provider] ?? '소셜'} 러너`,
          realName: trimmedName,
          phone: '',
          provinceName: '',
          cityName: '',
          districtName: '',
          addressDetail: '',
          publicTag: createPublicTag(store),
          friendDistanceKm: 0,
          friendPoints: 0,
          districtDistanceKm: 0,
          districtPoints: 0,
          rewardPoints: 0,
          streakDays: 0,
          rankState: { ...INITIAL_RANK },
          connectedSources: createDefaultConnectedSources(),
          notificationSettings: createDefaultNotificationSettings(),
          socialAccounts: [{
            provider,
            providerUserId,
            ...(email ? { email } : {}),
            connectedAt: new Date().toISOString(),
          }],
          createdAt: new Date().toISOString(),
        };

        store.users.push(user);
        store.runs.push(...createStarterRuns(userId));
        const accessToken = createSessionForUser(store, {
          userId: user.id,
          createToken,
          sessionTtlMs,
        });

        return { accessToken, user: buildProfile(store, user), isNewUser: true };
      });
    },
  };
}
