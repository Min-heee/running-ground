import * as SecureStore from 'expo-secure-store';

const SESSION_STORAGE_KEY = 'runningground.session.v1';
const LEGACY_SESSION_STORAGE_KEY = 'runnigapp.session.v1';

function getWebStorage() {
  if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage) {
    return window.localStorage;
  }

  return null;
}

async function migrateLegacySecureStoreSession() {
  const legacyValue = await SecureStore.getItemAsync(LEGACY_SESSION_STORAGE_KEY);

  if (legacyValue) {
    await SecureStore.setItemAsync(SESSION_STORAGE_KEY, legacyValue);
    await SecureStore.deleteItemAsync(LEGACY_SESSION_STORAGE_KEY);
  }

  return legacyValue;
}

function migrateLegacyWebSession(storage: Storage) {
  const legacyValue = storage.getItem(LEGACY_SESSION_STORAGE_KEY);

  if (legacyValue) {
    storage.setItem(SESSION_STORAGE_KEY, legacyValue);
    storage.removeItem(LEGACY_SESSION_STORAGE_KEY);
  }

  return legacyValue;
}

export async function getStoredSessionValue() {
  const webStorage = getWebStorage();

  if (webStorage) {
    return webStorage.getItem(SESSION_STORAGE_KEY) ?? migrateLegacyWebSession(webStorage);
  }

  try {
    const isSecureStoreAvailable = await SecureStore.isAvailableAsync();

    if (!isSecureStoreAvailable) {
      return null;
    }

    return await SecureStore.getItemAsync(SESSION_STORAGE_KEY) ?? await migrateLegacySecureStoreSession();
  } catch {
    return null;
  }
}

export async function setStoredSessionValue(value: string) {
  const webStorage = getWebStorage();

  if (webStorage) {
    webStorage.setItem(SESSION_STORAGE_KEY, value);
    webStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
    return;
  }

  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.setItemAsync(SESSION_STORAGE_KEY, value);
      await SecureStore.deleteItemAsync(LEGACY_SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore persistence failures and continue with in-memory session state.
  }
}

export async function clearStoredSessionValue() {
  const webStorage = getWebStorage();

  if (webStorage) {
    webStorage.removeItem(SESSION_STORAGE_KEY);
    webStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
    return;
  }

  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
      await SecureStore.deleteItemAsync(LEGACY_SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore persistence failures and continue with in-memory session state.
  }
}
