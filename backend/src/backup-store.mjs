import { createStoreBackup, getStoreBackupDirectory, getStoreFilePath } from './store.mjs';

const backupPath = createStoreBackup('manual');

if (!backupPath) {
  throw new Error('현재 저장소를 백업하지 못했어요.');
}

console.log(`[backup] store: ${getStoreFilePath()}`);
console.log(`[backup] backup directory: ${getStoreBackupDirectory()}`);
console.log(`[backup] created: ${backupPath}`);
