import * as jsonStoreAdapter from './jsonStoreAdapter.mjs';

export const STORE_DRIVER = (process.env.BACKEND_STORE_DRIVER ?? 'json').trim().toLowerCase();

if (STORE_DRIVER !== 'json') {
  throw new Error(`Unsupported BACKEND_STORE_DRIVER: ${STORE_DRIVER}. 현재 런타임은 json 저장소만 지원해요.`);
}

export const createStoreBackup = jsonStoreAdapter.createStoreBackup;
export const getStoreBackupDirectory = jsonStoreAdapter.getStoreBackupDirectory;
export const getStoreDiagnostics = jsonStoreAdapter.getStoreDiagnostics;
export const getStoreFilePath = jsonStoreAdapter.getStoreFilePath;
export const listStoreBackups = jsonStoreAdapter.listStoreBackups;
export const loadStore = jsonStoreAdapter.loadStore;
export const mutateStore = jsonStoreAdapter.mutateStore;
export const resetStore = jsonStoreAdapter.resetStore;
export const restoreStoreBackup = jsonStoreAdapter.restoreStoreBackup;
export const saveStore = jsonStoreAdapter.saveStore;
