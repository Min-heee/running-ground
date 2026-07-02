import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The store module reads its file paths from config at import time, so the isolated
// temp locations MUST be in process.env before the dynamic import below.
const dataDirectory = mkdtempSync(join(tmpdir(), 'runningground-store-test-'));
const storeFile = join(dataDirectory, 'store.json');
const backupDirectory = join(dataDirectory, 'backups');

process.env.BACKEND_STORE_FILE = storeFile;
process.env.BACKEND_STORE_BACKUP_DIRECTORY = backupDirectory;
process.env.BACKEND_STORE_BACKUP_ON_SAVE = 'true';
// Short debounce window so the "fires again after the interval" case stays fast. Rapid
// consecutive saves are synchronous (sub-millisecond), so 250ms is a safe margin.
process.env.BACKEND_STORE_BACKUP_MIN_INTERVAL_MS = '250';

const { loadStore, mutateStore } = await import('./store.mjs');

const TEST_USER_ID = 'store-test-user';

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function listSaveBackups() {
  if (!existsSync(backupDirectory)) {
    return [];
  }

  return readdirSync(backupDirectory).filter((entry) => entry.includes('-save-'));
}

function upsertTestUserName(name) {
  return mutateStore((store) => {
    const existing = store.users.find((user) => user.id === TEST_USER_ID);

    if (existing) {
      existing.name = name;
      return existing.id;
    }

    store.users.push({
      id: TEST_USER_ID,
      username: TEST_USER_ID,
      name,
      realName: name,
      publicTag: '#ST01',
      provinceName: '경기도',
      cityName: '고양시',
      districtName: '일산서구',
      createdAt: new Date().toISOString(),
    });
    return TEST_USER_ID;
  });
}

test('store file is serialized compactly and stays parseable', () => {
  loadStore();
  const fileContents = readFileSync(storeFile, 'utf8');
  const parsed = JSON.parse(fileContents);

  assert.equal(fileContents, JSON.stringify(parsed));
  assert.ok(Array.isArray(parsed.users));
});

test('unchanged mutation skips the file write entirely and still returns the mutator result', async () => {
  // Establish a save baseline first so change detection has a real prior mutation behind it.
  upsertTestUserName('스킵테스트-기준');

  const beforeStat = statSync(storeFile);
  const beforeContents = readFileSync(storeFile, 'utf8');
  const beforeBackupCount = listSaveBackups().length;

  await sleep(20);

  const result = mutateStore((store) => {
    // Pure read poll: touch nothing, just read.
    return store.users.length;
  });

  const afterStat = statSync(storeFile);

  assert.ok(Number.isInteger(result) && result >= 1);
  assert.equal(afterStat.mtimeMs, beforeStat.mtimeMs);
  assert.equal(readFileSync(storeFile, 'utf8'), beforeContents);
  assert.equal(listSaveBackups().length, beforeBackupCount);
});

test('changed mutation persists to disk', () => {
  const changedName = `변경된이름-${Date.now()}`;
  const userId = upsertTestUserName(changedName);

  const persisted = JSON.parse(readFileSync(storeFile, 'utf8'));
  const persistedUser = persisted.users.find((user) => user.id === userId);

  assert.equal(persistedUser?.name, changedName);

  // The next unchanged mutation must skip again (change detection re-baselines on save).
  const beforeStat = statSync(storeFile);
  mutateStore(() => null);
  assert.equal(statSync(storeFile).mtimeMs, beforeStat.mtimeMs);
});

test('save-triggered backups are debounced to the configured interval', async () => {
  loadStore();

  // Let any debounce window opened by previous tests expire.
  await sleep(300);

  const before = listSaveBackups().length;

  upsertTestUserName(`백업확인-1-${Date.now()}`);
  assert.equal(listSaveBackups().length, before + 1, 'first change after the interval should back up');

  upsertTestUserName(`백업확인-2-${Date.now()}`);
  upsertTestUserName(`백업확인-3-${Date.now()}`);
  assert.equal(listSaveBackups().length, before + 1, 'changes inside the interval must NOT back up again');

  await sleep(300);

  upsertTestUserName(`백업확인-4-${Date.now()}`);
  assert.equal(listSaveBackups().length, before + 2, 'a change after the interval elapses backs up again');
});

test('async mutator throws instead of silently saving before the mutation completes', () => {
  const before = readFileSync(storeFile, 'utf8');

  assert.throws(
    () => mutateStore(async (store) => {
      store.users.push({ id: '절대저장되면안됨' });
    }),
    /동기 함수/,
  );

  assert.equal(readFileSync(storeFile, 'utf8'), before);
});
