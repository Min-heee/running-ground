import { getStoreFilePath, resetStore } from './store.mjs';

resetStore();
console.log(`Store reset: ${getStoreFilePath()}`);
