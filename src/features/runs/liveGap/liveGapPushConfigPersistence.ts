// Device persistence for the live-gap push config, behind the "다음에도 이 설정 기억하기"
// checkbox. Kept OUT of the pure store (liveGapPushConfig.ts) so that module stays
// synchronous and node-test-safe; expo-secure-store is loaded through a dynamic import
// guard (same pattern as liveMatchGapVoice/Notifications), so importing this file in a
// plain-node context just no-ops instead of throwing.
//
// Behaviour mirrors a login "save my ID" checkbox: while `remember` is on, every config
// change is written back; turning it off wipes the stored copy. On the next launch the
// app calls initializeLiveGapPushConfigPersistence() once to restore the saved choice.

import {
  getLiveGapPushConfig,
  hydrateLiveGapPushConfig,
  subscribeLiveGapPushConfig,
} from '@/features/runs/liveGap/liveGapPushConfig';

const STORAGE_KEY = 'runningground.liveGapPush.v1';

// A minimal async key-value port so the persistence wiring can be unit-tested with an
// in-memory fake; production uses the secure-store/localStorage adapter below.
export type LiveGapConfigStorageAdapter = {
  read: () => Promise<string | null>;
  write: (value: string) => Promise<void>;
  remove: () => Promise<void>;
};

function getWebStorage(): Storage | null {
  if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage) {
    return window.localStorage;
  }

  return null;
}

async function getSecureStore() {
  try {
    return await import('expo-secure-store');
  } catch {
    return null;
  }
}

// Default adapter: localStorage on web, expo-secure-store on native (behind the dynamic
// import guard). Every path swallows failures so a storage hiccup never crashes the app —
// the in-session choice still applies, it just won't survive a restart.
const deviceStorageAdapter: LiveGapConfigStorageAdapter = {
  async read() {
    const webStorage = getWebStorage();

    if (webStorage) {
      return webStorage.getItem(STORAGE_KEY);
    }

    const SecureStore = await getSecureStore();

    if (!SecureStore) {
      return null;
    }

    try {
      if (!(await SecureStore.isAvailableAsync())) {
        return null;
      }

      return await SecureStore.getItemAsync(STORAGE_KEY);
    } catch {
      return null;
    }
  },

  async write(value: string) {
    const webStorage = getWebStorage();

    if (webStorage) {
      webStorage.setItem(STORAGE_KEY, value);
      return;
    }

    const SecureStore = await getSecureStore();

    if (!SecureStore) {
      return;
    }

    try {
      if (await SecureStore.isAvailableAsync()) {
        await SecureStore.setItemAsync(STORAGE_KEY, value);
      }
    } catch {
      // Ignore persistence failures — the in-session choice still applies.
    }
  },

  async remove() {
    const webStorage = getWebStorage();

    if (webStorage) {
      webStorage.removeItem(STORAGE_KEY);
      return;
    }

    const SecureStore = await getSecureStore();

    if (!SecureStore) {
      return;
    }

    try {
      if (await SecureStore.isAvailableAsync()) {
        await SecureStore.deleteItemAsync(STORAGE_KEY);
      }
    } catch {
      // Ignore — nothing more we can do if the delete fails.
    }
  },
};

let initialized = false;
let unsubscribe: (() => void) | null = null;

// Restore the persisted choice (if the user opted in) and then start mirroring every
// future config change to storage. Safe to call more than once — only the first call does
// work, so React strict-mode double-invoke / fast refresh can't re-hydrate over live
// edits or stack duplicate subscriptions.
export async function initializeLiveGapPushConfigPersistence(
  adapter: LiveGapConfigStorageAdapter = deviceStorageAdapter,
): Promise<void> {
  if (initialized) {
    return;
  }
  initialized = true;

  const raw = await adapter.read();

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      // Only restore when the saved copy actually opted in; otherwise leave the defaults.
      if (parsed && typeof parsed === 'object' && (parsed as { remember?: unknown }).remember === true) {
        hydrateLiveGapPushConfig(parsed);
      }
    } catch {
      // Corrupt payload — drop it and fall back to defaults.
      void adapter.remove();
    }
  }

  // Subscribe AFTER hydration so restoring the saved config does not immediately fire the
  // persist callback (it would only re-write the same value, but this keeps it tidy).
  unsubscribe = subscribeLiveGapPushConfig(() => {
    const config = getLiveGapPushConfig();

    if (config.remember) {
      void adapter.write(JSON.stringify(config));
    } else {
      void adapter.remove();
    }
  });
}

// Test-only: tear down the singleton so each test starts from a clean slate.
export function resetLiveGapPushConfigPersistenceForTests() {
  unsubscribe?.();
  unsubscribe = null;
  initialized = false;
}
