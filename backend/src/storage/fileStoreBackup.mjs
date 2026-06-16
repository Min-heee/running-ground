// Reusable on-disk store-backup helper.
//
// This is the SAME file-backup mechanism the JSON store adapter (src/store.mjs) uses to
// snapshot the whole-store to a timestamped file in the backup directory: timestamped
// filenames, retention pruning, listing, and restore reads. The Postgres store adapter
// reuses it so on-save backups keep working even though the canonical store now lives in
// Postgres — we just snapshot the serialized whole-store JSON to disk.
//
// Backup configuration is read directly from the environment (mirroring config.mjs's
// resolution/defaults) instead of importing config.mjs, because config.mjs runs release
// validation at import time and throws outside development — undesirable for an adapter
// that may be imported by tests/tools.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
// src/storage -> backend root is two levels up; project root one more.
const backendDirectory = resolve(currentDirectory, '..', '..');
const projectDirectory = resolve(backendDirectory, '..');

const defaultStoreFile = join(backendDirectory, 'data', 'store.json');
const defaultBackupDirectory = join(dirname(defaultStoreFile), 'backups');

function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveConfiguredPath(filePath, fallbackPath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return fallbackPath;
  }

  return isAbsolute(filePath) ? filePath : resolve(projectDirectory, filePath);
}

function parseNumber(value, defaultValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

// Resolve the same backup directory / base name the JSON adapter derives from the store file,
// so the Postgres adapter writes backups next to (and with the same naming as) the JSON store.
const storeFilePath = resolveConfiguredPath(process.env.BACKEND_STORE_FILE, defaultStoreFile);
const storeExtension = '.json';
const storeBaseName = (() => {
  const fileName = storeFilePath.split(/[\\/]/).pop() ?? 'store.json';
  return fileName.endsWith(storeExtension) ? fileName.slice(0, -storeExtension.length) : fileName;
})();

export function getStoreBackupDirectory() {
  return resolveConfiguredPath(
    process.env.BACKEND_STORE_BACKUP_DIRECTORY,
    defaultBackupDirectory,
  );
}

export function getStoreBackupRetention() {
  return Math.max(1, parseNumber(process.env.BACKEND_STORE_BACKUP_RETENTION, 10));
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
  mkdirSync(getStoreBackupDirectory(), { recursive: true });
}

function backupCandidates() {
  const backupDirectory = getStoreBackupDirectory();

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

function pruneStoreBackups() {
  const retention = getStoreBackupRetention();

  backupCandidates()
    .slice(retention)
    .forEach((backup) => {
      rmSync(backup.path, { force: true });
    });
}

// Snapshot a serialized whole-store JSON string to a timestamped backup file. Mirrors the
// JSON adapter's createStoreBackupFromContents (same filename shape + retention prune).
export function writeStoreBackupContents(fileContents, reason = 'save') {
  if (typeof fileContents !== 'string' || !fileContents.trim()) {
    return null;
  }

  ensureBackupDirectory();

  const backupFileName = `${storeBaseName}-${formatBackupTimestamp()}-${reason}-${Math.random().toString(16).slice(2, 8)}${storeExtension}`;
  const backupPath = join(getStoreBackupDirectory(), backupFileName);

  writeFileSync(backupPath, fileContents, 'utf8');
  pruneStoreBackups();

  return backupPath;
}

export function listStoreBackupFiles() {
  return backupCandidates().map(({ name, path }) => {
    const stats = statSync(path);
    return {
      name,
      path,
      sizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    };
  });
}

// Read the contents of a backup (by file name or absolute path) so a caller can restore it.
export function readStoreBackupContents(backupFileNameOrPath) {
  const backupPath = isAbsolute(backupFileNameOrPath)
    ? backupFileNameOrPath
    : join(getStoreBackupDirectory(), backupFileNameOrPath);

  if (!existsSync(backupPath)) {
    throw new Error(`백업 파일을 찾을 수 없어: ${backupFileNameOrPath}`);
  }

  return readFileSync(backupPath, 'utf8');
}

export { normalizeOptionalString };
