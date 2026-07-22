import * as SecureStore from 'expo-secure-store';

import {
  deserializeGhostRecord,
  serializeGhostRecord,
  type GhostRecord,
} from './ghostTrackCodec';

// 3-slot persistent storage for ghost records. Mirrors the themeMode storage
// pattern (web localStorage / native SecureStore, every failure swallowed).
// ONE KEY PER SLOT keeps each value ~1.5KB — inside SecureStore's safe size —
// which is the whole reason the codec compresses tracks (owner: "너무 파일
// 크기를 크게 저장하면 에러나니깐").

export const GHOST_SLOT_COUNT = 3;

const SLOT_KEYS = ['runningground.ghostRun.slot0.v1', 'runningground.ghostRun.slot1.v1', 'runningground.ghostRun.slot2.v1'];

function getWebStorage() {
  if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage) {
    return window.localStorage;
  }

  return null;
}

async function readSlot(slot: number): Promise<GhostRecord | null> {
  const key = SLOT_KEYS[slot];
  const webStorage = getWebStorage();

  if (webStorage) {
    try {
      return deserializeGhostRecord(webStorage.getItem(key));
    } catch {
      return null;
    }
  }

  try {
    if (!(await SecureStore.isAvailableAsync())) {
      return null;
    }

    return deserializeGhostRecord(await SecureStore.getItemAsync(key));
  } catch {
    return null;
  }
}

async function writeSlot(slot: number, record: GhostRecord | null): Promise<void> {
  const key = SLOT_KEYS[slot];
  const webStorage = getWebStorage();

  if (webStorage) {
    try {
      if (record) {
        webStorage.setItem(key, serializeGhostRecord(record));
      } else {
        webStorage.removeItem(key);
      }
    } catch {
      // Storage hiccups must never break the save flow.
    }
    return;
  }

  try {
    if (!(await SecureStore.isAvailableAsync())) {
      return;
    }

    if (record) {
      await SecureStore.setItemAsync(key, serializeGhostRecord(record));
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  } catch {
    // Same as above.
  }
}

// Slot-indexed list (null = empty slot), so the UI can offer "which one to
// replace" when all three are full.
export async function loadGhostSlots(): Promise<(GhostRecord | null)[]> {
  return Promise.all(SLOT_KEYS.map((_, slot) => readSlot(slot)));
}

export async function saveGhostToSlot(slot: number, record: GhostRecord): Promise<void> {
  if (slot < 0 || slot >= GHOST_SLOT_COUNT) {
    return;
  }

  await writeSlot(slot, record);
}

export async function deleteGhostSlot(slot: number): Promise<void> {
  if (slot < 0 || slot >= GHOST_SLOT_COUNT) {
    return;
  }

  await writeSlot(slot, null);
}
