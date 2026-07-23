import { mkdirSync, existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join } from 'node:path';
import { createSeedStore, createRegionTree } from './seed.mjs';
import {
  APP_ENV,
  SESSION_TTL_MS,
  STORE_BACKUP_DIRECTORY,
  STORE_BACKUP_MIN_INTERVAL_MS,
  STORE_BACKUP_ON_SAVE,
  STORE_BACKUP_RETENTION,
  STORE_FILE,
} from './config.mjs';
import { migrateAuthStore } from './auth.mjs';
import { cleanupLegacyIntegrationSources } from './lib/integrationSourceMigrations.mjs';
import { migrateRegionMergeStore } from './lib/regionMergeMigrations.mjs';

const dataDirectory = dirname(STORE_FILE);
const storeFilePath = STORE_FILE;
const storeExtension = extname(storeFilePath) || '.json';
const storeBaseName = basename(storeFilePath, storeExtension);
const backupDirectory = STORE_BACKUP_DIRECTORY;

let cachedStore = null;
// Serialization of cachedStore, kept in lockstep with every cachedStore (re)assignment.
// It is BOTH the change-detection baseline for mutateStore's skip (a pure read poll must not
// pay migrations/regionTree/serialize/write) and the pre-save snapshot the save-triggered
// backup copies — killing the per-save whole-file readFileSync.
let cachedSerializedStore = null;
// Last time a save-triggered backup fired. Save backups are debounced to at most one per
// STORE_BACKUP_MIN_INTERVAL_MS; manual/explicit backups (createStoreBackup, restore/reset
// paths) are NOT debounced.
let lastSaveBackupAtMs = 0;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function migrateProfileStore(store) {
  if (!Array.isArray(store.users)) {
    return false;
  }

  let changed = false;

  for (const user of store.users) {
    if (typeof user.name === 'string' && user.name.trim() && (!user.realName || typeof user.realName !== 'string' || !user.realName.trim())) {
      user.realName = user.name;
      changed = true;
    }
  }

  return changed;
}

function migrateIntegrationStore(store) {
  if (!Array.isArray(store.integrationImports)) {
    store.integrationImports = [];
    return true;
  }

  return false;
}

function migrateLegacyIntegrationSources(store) {
  return cleanupLegacyIntegrationSources(store);
}

function migrateNotificationStore(store) {
  if (!Array.isArray(store.notifications)) {
    store.notifications = [];
    return true;
  }

  return false;
}

function migratePhoneVerificationStore(store) {
  if (!Array.isArray(store.phoneVerificationChallenges)) {
    store.phoneVerificationChallenges = [];
    return true;
  }

  return false;
}

function migrateMatchQueueStore(store) {
  let changed = false;

  if (!store.matchQueues || typeof store.matchQueues !== 'object') {
    store.matchQueues = {
      duel: [],
      group: [],
    };
    changed = true;
  }

  if (!Array.isArray(store.matchQueues.duel)) {
    store.matchQueues.duel = [];
    changed = true;
  }

  if (!Array.isArray(store.matchQueues.group)) {
    store.matchQueues.group = [];
    changed = true;
  }

  if (!Array.isArray(store.matchSessions)) {
    store.matchSessions = [];
    changed = true;
  }

  if (!Array.isArray(store.matchRooms)) {
    store.matchRooms = [];
    changed = true;
  }

  return changed;
}

function migrateAdminStore(store) {
  let changed = false;

  if (!Array.isArray(store.notices)) {
    store.notices = [];
    changed = true;
  }

  for (const notice of store.notices) {
    if (typeof notice.priority !== 'number' || !Number.isFinite(notice.priority)) {
      notice.priority = 0;
      changed = true;
    }

    if (typeof notice.isActive !== 'boolean') {
      notice.isActive = true;
      changed = true;
    }
  }

  if (!Array.isArray(store.marketCatalog)) {
    store.marketCatalog = [];
    changed = true;
  }

  const marketItemCostById = new Map();

  for (const item of store.marketCatalog) {
    marketItemCostById.set(item.id, item.costPoints);

    if (typeof item.isActive !== 'boolean') {
      item.isActive = true;
      changed = true;
    }

    if (!Object.prototype.hasOwnProperty.call(item, 'inventoryCount')) {
      item.inventoryCount = null;
      changed = true;
    }
  }

  if (!Array.isArray(store.offlineRaceEvents)) {
    store.offlineRaceEvents = [];
    changed = true;
  }

  for (const event of store.offlineRaceEvents) {
    if (!Array.isArray(event.registeredUserTags)) {
      event.registeredUserTags = [];
      changed = true;
    }
  }

  if (!Array.isArray(store.offlineRaceGuideSteps)) {
    store.offlineRaceGuideSteps = [
      '오프라인 마라톤 일정이 열리면 여기에서 날짜별로 바로 신청할 수 있어요.',
      '지금은 일정 등록 전이라 신청 가능한 회차가 없어요.',
      '실제 운영 일정이 준비되면 시간대와 거리 선택이 함께 열릴 예정이에요.',
    ];
    changed = true;
  }

  if (Array.isArray(store.rewardRedemptions)) {
    for (const entry of store.rewardRedemptions) {
      if (typeof entry.costPoints !== 'number') {
        const catalogCostPoints = marketItemCostById.get(entry.itemId);

        if (typeof catalogCostPoints === 'number') {
          entry.costPoints = catalogCostPoints;
          changed = true;
        }
      }

      if (typeof entry.status !== 'string' || !entry.status.trim()) {
        entry.status = 'requested';
        changed = true;
      }

      if (typeof entry.adminNote !== 'string') {
        entry.adminNote = '';
        changed = true;
      }
    }
  }

  if (store.version !== 5) {
    store.version = 5;
    changed = true;
  }

  return changed;
}

function serializeStore(store) {
  // Compact on purpose: the store is serialized on every persisted mutation, and the hot
  // request path also serializes for change detection. JSON.parse consumers (loadStore,
  // backup/restore/reset scripts, migrate-json-to-postgres) don't care about indentation.
  return JSON.stringify(store);
}

function writeStoreFileAtomic(filePath, fileContents) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  writeFileSync(tempPath, fileContents, 'utf8');

  try {
    renameSync(tempPath, filePath);
  } catch (error) {
    if (existsSync(filePath)) {
      rmSync(filePath);
      renameSync(tempPath, filePath);
    } else {
      throw error;
    }
  } finally {
    if (existsSync(tempPath)) {
      rmSync(tempPath);
    }
  }
}

function formatBackupTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');

  return `${year}${month}${day}-${hours}${minutes}${seconds}-${milliseconds}`;
}

function ensureBackupDirectory() {
  mkdirSync(backupDirectory, { recursive: true });
}

function pruneStoreBackups() {
  if (!existsSync(backupDirectory)) {
    return;
  }

  const backups = readdirSync(backupDirectory)
    .filter((entry) => entry.startsWith(`${storeBaseName}-`) && entry.endsWith(storeExtension))
    .map((entry) => {
      const path = join(backupDirectory, entry);
      return {
        name: entry,
        path,
        modifiedAtMs: statSync(path).mtimeMs,
      };
    })
    .sort((left, right) => right.modifiedAtMs - left.modifiedAtMs);

  backups.slice(STORE_BACKUP_RETENTION).forEach((backup) => {
    rmSync(backup.path, { force: true });
  });
}

function createStoreBackupFromContents(fileContents, reason = 'save') {
  if (typeof fileContents !== 'string' || !fileContents.trim()) {
    return null;
  }

  ensureBackupDirectory();

  const backupFileName = `${storeBaseName}-${formatBackupTimestamp()}-${reason}-${Math.random().toString(16).slice(2, 8)}${storeExtension}`;
  const backupPath = join(backupDirectory, backupFileName);

  writeFileSync(backupPath, fileContents, 'utf8');
  pruneStoreBackups();

  return backupPath;
}

function createCorruptStoreSnapshot(fileContents) {
  if (typeof fileContents !== 'string' || !fileContents.trim()) {
    return null;
  }

  ensureBackupDirectory();

  const backupFileName = `${storeBaseName}-${formatBackupTimestamp()}-corrupt-${Math.random().toString(16).slice(2, 8)}${storeExtension}.corrupt`;
  const backupPath = join(backupDirectory, backupFileName);

  writeFileSync(backupPath, fileContents, 'utf8');
  return backupPath;
}

function listStoreBackupCandidates() {
  if (!existsSync(backupDirectory)) {
    return [];
  }

  return readdirSync(backupDirectory)
    .filter((entry) => entry.startsWith(`${storeBaseName}-`) && entry.endsWith(storeExtension))
    .map((entry) => {
      const path = join(backupDirectory, entry);
      return {
        name: entry,
        path,
        modifiedAtMs: statSync(path).mtimeMs,
      };
    })
    .sort((left, right) => right.modifiedAtMs - left.modifiedAtMs);
}

function readStoreContentsFromDisk() {
  ensureStoreFile();

  const fileContents = readFileSync(storeFilePath, 'utf8');

  try {
    return {
      fileContents,
      store: JSON.parse(fileContents),
      recoveredFromBackup: false,
    };
  } catch (parseError) {
    const corruptSnapshotPath = createCorruptStoreSnapshot(fileContents);

    for (const backup of listStoreBackupCandidates()) {
      try {
        const backupContents = readFileSync(backup.path, 'utf8');
        const backupStore = JSON.parse(backupContents);
        writeStoreFileAtomic(storeFilePath, backupContents);
        console.error(`[runningground-backend] store JSON was corrupted. Restored latest valid backup: ${backup.path}`);

        if (corruptSnapshotPath) {
          console.error(`[runningground-backend] corrupted store snapshot saved: ${corruptSnapshotPath}`);
        }

        return {
          fileContents: backupContents,
          store: backupStore,
          recoveredFromBackup: true,
        };
      } catch {
        // Keep scanning older backups until a valid JSON snapshot is found.
      }
    }

    const error = new Error(
      `저장소 JSON을 읽을 수 없고 복구 가능한 백업도 찾지 못했어요. store=${storeFilePath}`
      + (corruptSnapshotPath ? ` corruptSnapshot=${corruptSnapshotPath}` : ''),
    );
    error.cause = parseError;
    throw error;
  }
}

function ensureStoreFile() {
  mkdirSync(dataDirectory, { recursive: true });

  if (existsSync(storeFilePath)) {
    return;
  }

  // In production a missing store file means real user data vanished (volume detach, bad
  // deploy, fat-fingered rm) — silently seeding a fresh store would LOOK healthy while
  // erasing everyone. Recover from the newest valid backup instead; only seed as a last
  // resort, loudly.
  if (APP_ENV === 'production') {
    for (const backup of listStoreBackupCandidates()) {
      try {
        const backupContents = readFileSync(backup.path, 'utf8');
        JSON.parse(backupContents);
        writeStoreFileAtomic(storeFilePath, backupContents);
        console.error(
          `[runningground-backend] store file was MISSING in production. Recovered from newest valid backup: ${backup.path}`,
        );
        return;
      } catch {
        // Keep scanning older backups until a valid JSON snapshot is found.
      }
    }

    console.error(
      `[runningground-backend] store file was MISSING in production and NO recoverable backup exists — seeding a FRESH store. `
      + `Existing user data was NOT recovered. store=${storeFilePath} backups=${backupDirectory}`,
    );
  }

  const seedStore = createSeedStore();
  writeStoreFileAtomic(storeFilePath, serializeStore(seedStore));
}

export function loadStore() {
  if (!cachedStore) {
    const { store: persistedStore, recoveredFromBackup } = readStoreContentsFromDisk();
    cachedStore = {
      ...persistedStore,
      regionTree: createRegionTree(persistedStore),
    };
    const changed = [
      migrateAuthStore(cachedStore, { sessionTtlMs: SESSION_TTL_MS, now: new Date() }),
      migrateProfileStore(cachedStore),
      migrateIntegrationStore(cachedStore),
      migrateLegacyIntegrationSources(cachedStore),
      migrateNotificationStore(cachedStore),
      migratePhoneVerificationStore(cachedStore),
      migrateMatchQueueStore(cachedStore),
      migrateAdminStore(cachedStore),
      migrateRegionMergeStore(cachedStore),
    ].some(Boolean);

    cachedSerializedStore = serializeStore(cachedStore);

    if (changed || recoveredFromBackup) {
      writeStoreFileAtomic(storeFilePath, cachedSerializedStore);
    }
  }

  return clone(cachedStore);
}

export function saveStore(nextStore, precomputedSerializedStore = null) {
  const previousSerializedStore = cachedSerializedStore;
  cachedStore = clone(nextStore);
  const migrationsChanged = [
    migrateAuthStore(cachedStore, { sessionTtlMs: SESSION_TTL_MS, now: new Date() }),
    migrateProfileStore(cachedStore),
    migrateIntegrationStore(cachedStore),
    migratePhoneVerificationStore(cachedStore),
    migrateMatchQueueStore(cachedStore),
    migrateAdminStore(cachedStore),
    migrateRegionMergeStore(cachedStore),
  ].some(Boolean);
  const previousRegionTree = cachedStore.regionTree;
  cachedStore.regionTree = createRegionTree(cachedStore);
  // The precomputed serialization (from mutateStore, taken BEFORE migrations + regionTree
  // rebuild) is only reusable when neither step altered the store — otherwise re-serialize
  // so the written file always matches cachedStore exactly.
  const regionTreeChanged = JSON.stringify(previousRegionTree ?? null) !== JSON.stringify(cachedStore.regionTree);
  ensureStoreFile();
  const serializedStore = precomputedSerializedStore !== null && !migrationsChanged && !regionTreeChanged
    ? precomputedSerializedStore
    : serializeStore(cachedStore);

  // Backup the PREVIOUS serialization (what the store looked like before this save) instead
  // of re-reading the whole store file from disk on every save. Save-triggered backups are
  // debounced; explicit backups (createStoreBackup, restore/reset paths) are not.
  if (
    STORE_BACKUP_ON_SAVE
    && previousSerializedStore
    && previousSerializedStore !== serializedStore
    && Date.now() - lastSaveBackupAtMs >= STORE_BACKUP_MIN_INTERVAL_MS
  ) {
    createStoreBackupFromContents(previousSerializedStore, 'save');
    lastSaveBackupAtMs = Date.now();
  }

  writeStoreFileAtomic(storeFilePath, serializedStore);
  cachedSerializedStore = serializedStore;
  return clone(cachedStore);
}

export function mutateStore(mutator) {
  const nextStore = loadStore();
  const result = mutator(nextStore);

  if (result && typeof result.then === 'function') {
    throw new Error(
      'mutateStore의 mutator는 동기 함수여야 해요. 비동기 mutator는 변경이 끝나기 전에 저장이 실행돼 저장소가 조용히 손상될 수 있어요.',
    );
  }

  const serializedNextStore = serializeStore(nextStore);

  // Pure read polls (and any mutator that ended up changing nothing) skip the whole save
  // pipeline: no migrations, no regionTree rebuild, no file write, no backup. The compare
  // may only err toward SAVING (e.g. key-order drift forces a save), never toward skipping
  // a real change — cachedSerializedStore is always exactly serializeStore(cachedStore).
  if (serializedNextStore === cachedSerializedStore) {
    return result;
  }

  saveStore(nextStore, serializedNextStore);
  return result;
}

export function resetStore() {
  // Explicit destructive path: snapshot the current store first (not debounced) so a reset
  // never silently discards the only copy of live data. saveStore's own save-backup can no
  // longer cover this — it compares against the in-memory serialization, which is empty when
  // the reset script runs without a prior loadStore.
  if (STORE_BACKUP_ON_SAVE && existsSync(storeFilePath)) {
    createStoreBackup('pre-reset');
  }

  const seedStore = createSeedStore();
  saveStore(seedStore);
  return clone(seedStore);
}

export function getStoreFilePath() {
  ensureStoreFile();
  return storeFilePath;
}

export function getStoreBackupDirectory() {
  return backupDirectory;
}

export function getStoreDiagnostics() {
  const storeExists = existsSync(storeFilePath);
  const storeStats = storeExists ? statSync(storeFilePath) : null;
  const backups = listStoreBackups();

  return {
    storeFile: storeFilePath,
    storeExists,
    storeSizeBytes: storeStats?.size ?? 0,
    storeModifiedAt: storeStats?.mtime.toISOString() ?? null,
    backupDirectory,
    backupCount: backups.length,
    latestBackup: backups[0] ?? null,
    cached: Boolean(cachedStore),
  };
}

export function listStoreBackups() {
  if (!existsSync(backupDirectory)) {
    return [];
  }

  return readdirSync(backupDirectory)
    .filter((entry) => entry.startsWith(`${storeBaseName}-`) && entry.endsWith(storeExtension))
    .map((entry) => {
      const path = join(backupDirectory, entry);
      const stats = statSync(path);

      return {
        name: entry,
        path,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      };
    })
    .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
}

export function createStoreBackup(reason = 'manual') {
  ensureStoreFile();
  const currentStoreContents = readFileSync(storeFilePath, 'utf8');
  return createStoreBackupFromContents(currentStoreContents, reason);
}

export function restoreStoreBackup(backupFileNameOrPath) {
  ensureStoreFile();

  const backupPath = isAbsolute(backupFileNameOrPath)
    ? backupFileNameOrPath
    : join(backupDirectory, backupFileNameOrPath);

  if (!existsSync(backupPath)) {
    throw new Error(`백업 파일을 찾을 수 없어: ${backupFileNameOrPath}`);
  }

  const currentStoreContents = existsSync(storeFilePath) ? readFileSync(storeFilePath, 'utf8') : '';

  if (currentStoreContents.trim()) {
    createStoreBackupFromContents(currentStoreContents, 'pre-restore');
  }

  const backupContents = readFileSync(backupPath, 'utf8');
  writeStoreFileAtomic(storeFilePath, backupContents);
  cachedStore = null;
  cachedSerializedStore = null;
  return loadStore();
}
