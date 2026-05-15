function buildAdminOverviewPayload(store, dependencies) {
  const {
    APP_ENV,
    PUBLIC_BASE_URL,
    ensureMarketCatalogStore,
    ensureNoticeStore,
    ensureOfflineRaceStore,
    getOfflineRaceStatus,
  } = dependencies;

  ensureNoticeStore(store);
  ensureMarketCatalogStore(store);
  ensureOfflineRaceStore(store);
  const now = new Date();
  const activeOfflineRaceEvents = store.offlineRaceEvents.filter((event) => getOfflineRaceStatus(event, now) !== 'finished');

  return {
    environment: APP_ENV,
    publicBaseUrl: PUBLIC_BASE_URL || undefined,
    counts: {
      users: store.users.length,
      runs: store.runs.length,
      marketItems: store.marketCatalog.length,
      activeMarketItems: store.marketCatalog.filter((item) => item.isActive !== false).length,
      offlineRaceEvents: store.offlineRaceEvents.length,
      activeOfflineRaceEvents: activeOfflineRaceEvents.length,
      notices: store.notices.length,
      activeNotices: store.notices.filter((notice) => notice.isActive !== false).length,
      rewardRedemptions: (store.rewardRedemptions ?? []).length,
      sessions: store.sessions.length,
    },
  };
}

function buildAdminUserSummary(store, user, dependencies) {
  const {
    ensureUserConnectedSources,
    getRunsForUser,
    getUserMetrics,
    normalizeOptionalString,
  } = dependencies;
  const metrics = getUserMetrics(store, user.id);
  const runs = getRunsForUser(store, user.id);

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    ...(normalizeOptionalString(user.realName) ? { realName: user.realName } : {}),
    ...(normalizeOptionalString(user.phone) ? { phone: user.phone } : {}),
    ...(normalizeOptionalString(user.birthDate) ? { birthDate: user.birthDate } : {}),
    publicTag: user.publicTag,
    ...(normalizeOptionalString(user.provinceName) ? { provinceName: user.provinceName } : {}),
    ...(normalizeOptionalString(user.cityName) ? { cityName: user.cityName } : {}),
    districtName: user.districtName,
    ...(normalizeOptionalString(user.universityName) ? { universityName: user.universityName } : {}),
    ...(normalizeOptionalString(user.createdAt) ? { createdAt: user.createdAt } : {}),
    lifetimeDistanceKm: metrics.lifetimeDistanceKm,
    currentWeekDistanceKm: metrics.currentWeekDistanceKm,
    currentWeekPoints: metrics.currentWeekPoints,
    totalRuns: runs.length,
    connectedSourceCount: ensureUserConnectedSources(user).filter((source) => source.connected).length,
  };
}

function buildAdminUsersPayload(store, dependencies) {
  const { normalizeOptionalString } = dependencies;

  return {
    users: [...store.users]
      .sort((left, right) => {
        const leftCreatedAt = normalizeOptionalString(left.createdAt);
        const rightCreatedAt = normalizeOptionalString(right.createdAt);

        if (leftCreatedAt !== rightCreatedAt) {
          return rightCreatedAt.localeCompare(leftCreatedAt);
        }

        return left.name.localeCompare(right.name, 'ko');
      })
      .map((user) => buildAdminUserSummary(store, user, dependencies)),
  };
}

export function createAdminReadService(dependencies) {
  return {
    buildAdminOverview: (store) => buildAdminOverviewPayload(store, dependencies),
    buildAdminUsers: (store) => buildAdminUsersPayload(store, dependencies),
  };
}
