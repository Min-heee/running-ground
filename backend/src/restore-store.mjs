import { getStoreBackupDirectory, getStoreFilePath, restoreStoreBackup } from './store.mjs';

const backupName = process.argv[2];

if (!backupName) {
  console.error('사용법: node ./src/restore-store.mjs <backup-file-name>');
  console.error(`백업 디렉터리: ${getStoreBackupDirectory()}`);
  process.exit(1);
}

const restoredStore = restoreStoreBackup(backupName);

console.log(`[restore] store: ${getStoreFilePath()}`);
console.log(`[restore] restored from: ${backupName}`);
console.log(`[restore] users: ${Array.isArray(restoredStore.users) ? restoredStore.users.length : 0}`);
