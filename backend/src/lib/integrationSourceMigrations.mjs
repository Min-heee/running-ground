// Legacy integration-source cleanup (launch hub-only decision, 2026-07-12).
//
// - mynb rows are REMOVED: MyNB consumes records rather than producing them
//   (client e4c70ff), so a "connection" could never deliver a run.
// - nrc / strava / garmin rows are kept but force-DISCONNECTED: the client no
//   longer offers them (hub-only catalog), so a legacy connected row would be
//   invisible in the selector yet still count as "1개 연결" and block the
//   "연동 안 함" row — an undisconnectable ghost. Flipping them back to the
//   pristine planned state clears the ghost while keeping the row available
//   for source labels and any future re-offering.
//
// Idempotent — a store already in the target shape reports no change. Shared
// by BOTH store drivers: the json driver runs it in the store.mjs load
// migration list, the postgres driver as a boot-time mutateStore sweep
// (storage/index.mjs), because the postgres adapter does not execute the json
// store's migration list.

const RETIRED_SOURCE_TYPES = new Set(['mynb']);
const HIDDEN_BRAND_SOURCE_TYPES = new Set(['nrc', 'strava', 'garmin']);

function disconnectHiddenBrandSource(source) {
  let changed = false;

  if (source.connected !== false) {
    source.connected = false;
    changed = true;
  }

  if (source.connectionStatus !== 'planned') {
    source.connectionStatus = 'planned';
    changed = true;
  }

  if (source.lastSyncedAt != null) {
    delete source.lastSyncedAt;
    changed = true;
  }

  return changed;
}

export function cleanupLegacyIntegrationSources(store) {
  if (!store || !Array.isArray(store.users)) {
    return false;
  }

  let changed = false;

  for (const user of store.users) {
    if (!Array.isArray(user?.connectedSources)) {
      continue;
    }

    const filteredSources = user.connectedSources.filter(
      (source) => !RETIRED_SOURCE_TYPES.has(source?.sourceType),
    );

    if (filteredSources.length !== user.connectedSources.length) {
      user.connectedSources = filteredSources;
      changed = true;
    }

    for (const source of filteredSources) {
      if (HIDDEN_BRAND_SOURCE_TYPES.has(source?.sourceType) && disconnectHiddenBrandSource(source)) {
        changed = true;
      }
    }
  }

  return changed;
}
