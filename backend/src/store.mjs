import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createSeedStore, createRegionTree } from './seed.mjs';
import { STORE_FILE } from './config.mjs';

const dataDirectory = dirname(STORE_FILE);
const storeFilePath = STORE_FILE;

let cachedStore = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureStoreFile() {
  mkdirSync(dataDirectory, { recursive: true });

  if (!existsSync(storeFilePath)) {
    const seedStore = createSeedStore();
    writeFileSync(storeFilePath, JSON.stringify(seedStore, null, 2), 'utf8');
  }
}

export function loadStore() {
  ensureStoreFile();

  if (!cachedStore) {
    const persistedStore = JSON.parse(readFileSync(storeFilePath, 'utf8'));
    cachedStore = {
      ...persistedStore,
      regionTree: createRegionTree(),
    };
    writeFileSync(storeFilePath, JSON.stringify(cachedStore, null, 2), 'utf8');
  }

  return clone(cachedStore);
}

export function saveStore(nextStore) {
  cachedStore = clone(nextStore);
  writeFileSync(storeFilePath, JSON.stringify(cachedStore, null, 2), 'utf8');
  return clone(cachedStore);
}

export function mutateStore(mutator) {
  const nextStore = loadStore();
  const result = mutator(nextStore);
  saveStore(nextStore);
  return result;
}

export function resetStore() {
  const seedStore = createSeedStore();
  saveStore(seedStore);
  return clone(seedStore);
}

export function getStoreFilePath() {
  ensureStoreFile();
  return storeFilePath;
}
