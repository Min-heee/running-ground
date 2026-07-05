export function createBackendStatusService({
  APP_ENV,
  PUBLIC_BASE_URL,
  STARTED_AT,
  STORE_DRIVER,
  ensureMarketCatalogStore,
  ensureNoticeStore,
  ensureOfflineRaceStore,
  getFriendsLeagueBridge,
  getPublicBackendConfig,
  getSessionRunsBridge,
  getStoreDiagnostics,
  getStoreFilePath,
  // NOTE: `getErrorMessage` and `loadStore` are intentionally no longer destructured here — the
  // public /api/health path (buildHealthStatus) is now a cheap liveness probe that neither loads
  // the store nor surfaces error detail (P2-6). The server may still pass them; they're ignored.
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

  // P2-6: /api/health is UNAUTHENTICATED, so keep it minimal and cheap. It is a liveness probe —
  // the process is up and serving HTTP — and deliberately does NOT parse the whole store (the
  // postgres driver's loadStore() reads+parses the entire app_store jsonb row) nor leak any
  // infra/config detail (env, store driver, file paths, bridge config, entity counts). This
  // preserves the Dockerfile healthcheck contract (it only checks response.ok — 200 {status:'ok'}
  // passes). Richer, store-backed status stays behind the authenticated admin surface
  // (buildAdminStatus). Kept async to preserve the routeHealthRequest await contract.
  async function buildHealthStatus() {
    return {
      statusCode: 200,
      payload: {
        status: 'ok',
        time: new Date().toISOString(),
      },
    };
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
