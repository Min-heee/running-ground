import { getStoreBackupDirectory, getStoreFilePath, listStoreBackups } from './store.mjs';

const backups = listStoreBackups();

console.log(`[backups] store: ${getStoreFilePath()}`);
console.log(`[backups] backup directory: ${getStoreBackupDirectory()}`);

if (backups.length === 0) {
  console.log('[backups] no snapshots found');
  process.exit(0);
}

for (const backup of backups) {
  console.log(`${backup.name}\t${backup.modifiedAt}\t${backup.sizeBytes}B`);
}
