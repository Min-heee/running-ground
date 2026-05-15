export function createBackendStatusService({
  APP_ENV,
  PUBLIC_BASE_URL,
  STARTED_AT,
  STORE_DRIVER,
  ensureMarketCatalogStore,
  ensureNoticeStore,
  ensureOfflineRaceStore,
  getErrorMessage,
  getFriendsLeagueBridge,
  getPublicBackendConfig,
  getSessionRunsBridge,
  getStoreDiagnostics,
  getStoreFilePath,
  loadStore,
}) {
  function buildStoreCounts(store) {
    return {
      users: store.users.length,
      runs: store.runs.length,
      integrationImports: (store.integrationImports ?? []).length,
      friendships: store.friendships.length,
      friendRequests: store.friendRequests.length,
      sessions: store.sessions.length,
      rewardRedemptions: (store.rewardRedemptions ?? []).length,
      notices: (store.notices ?? []).length,
      marketItems: (store.marketCatalog ?? []).length,
      offlineRaceEvents: (store.offlineRaceEvents ?? []).length,
    };
  }

  function buildReadBridgeConfig() {
    return {
      sessionRuns: getSessionRunsBridge().getConfig(),
      friendsLeague: getFriendsLeagueBridge().getConfig(),
    };
  }

  function buildHealthStatus() {
    const basePayload = {
      environment: APP_ENV,
      startedAt: STARTED_AT,
      uptimeSeconds: Math.round(process.uptime()),
      storeDriver: STORE_DRIVER,
      storeFile: getStoreFilePath(),
      publicBaseUrl: PUBLIC_BASE_URL || undefined,
      config: getPublicBackendConfig(),
      readBridges: buildReadBridgeConfig(),
      now: new Date().toISOString(),
    };

    try {
      const store = loadStore();

      return {
        statusCode: 200,
        payload: {
          status: 'ok',
          ready: true,
          ...basePayload,
          store: {
            ...getStoreDiagnostics(),
            counts: buildStoreCounts(store),
          },
        },
      };
    } catch (error) {
      return {
        statusCode: 503,
        payload: {
          status: 'error',
          ready: false,
          ...basePayload,
          message: getErrorMessage(error),
          store: getStoreDiagnostics(),
        },
      };
    }
  }

  function buildAdminStatus(store) {
    ensureNoticeStore(store);
    ensureMarketCatalogStore(store);
    ensureOfflineRaceStore(store);
    return {
      status: 'ok',
      startedAt: STARTED_AT,
      uptimeSeconds: Math.round(process.uptime()),
      storeDriver: STORE_DRIVER,
      storeFile: getStoreFilePath(),
      config: getPublicBackendConfig(),
      readBridges: buildReadBridgeConfig(),
      store: getStoreDiagnostics(),
      counts: buildStoreCounts(store),
    };
  }

  function buildAdminSession() {
    return {
      success: true,
      environment: APP_ENV,
      publicBaseUrl: PUBLIC_BASE_URL || undefined,
    };
  }

  return {
    buildAdminSession,
    buildAdminStatus,
    buildHealthStatus,
  };
}
