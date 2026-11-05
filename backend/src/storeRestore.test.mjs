import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

// The store module reads its file paths from config at import time, so the isolated temp
// locations MUST be in process.env before the dynamic import below. Kept in its own file so the
// tight retention here does not interfere with store.test.mjs's backup-counting tests.
const dataDirectory = mkdtempSync(join(tmpdir(), 'runningground-store-restore-test-'));
const backupDirectory = join(dataDirectory, 'backups');

process.env.BACKEND_STORE_FILE = join(dataDirectory, 'store.json');
process.env.BACKEND_STORE_BACKUP_DIRECTORY = backupDirectory;
process.env.BACKEND_STORE_BACKUP_ON_SAVE = 'false';
process.env.BACKEND_STORE_BACKUP_RETENTION = '2';

const { createStoreBackup, mutateStore, restoreStoreBackup } = await import('./store.mjs');

test('restoring the OLDEST backup while the directory is at retention succeeds', () => {
  mutateStore((store) => {
    store.restoreMarker = 'oldest';
  });
  const oldestPath = createStoreBackup('manual');
  // Make it unambiguously the oldest by mtime (the prune orders by modification time).
  const past = new Date(Date.now() - 60_000);
  utimesSync(oldestPath, past, past);

  mutateStore((store) => {
    store.restoreMarker = 'newer';
  });
  createStoreBackup('manual');

  mutateStore((store) => {
    store.restoreMarker = 'live';
  });
  assert.equal(readdirSync(backupDirectory).length, 2, 'backup directory is at retention');

  // The pre-restore snapshot prunes down to retention; it must not delete the target first.
  const restored = restoreStoreBackup(basename(oldestPath));

  assert.equal(restored.restoreMarker, 'oldest');
  assert.ok(readdirSync(backupDirectory).some((name) => name.includes('-pre-restore-')));
});
