const SESSION_STORAGE_KEY = 'runnigapp.mock.session';

let mockSignedIn = false;

function getStorage() {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
    return null;
  }

  return globalThis.localStorage;
}

export async function hydrateSession() {
  const storage = getStorage();

  if (!storage) {
    return mockSignedIn;
  }

  const storedValue = storage.getItem(SESSION_STORAGE_KEY);
  mockSignedIn = storedValue === 'signed-in';
  return mockSignedIn;
}

export function getIsSignedIn() {
  return mockSignedIn;
}

export async function signIn() {
  mockSignedIn = true;
  const storage = getStorage();
  storage?.setItem(SESSION_STORAGE_KEY, 'signed-in');
}

export async function signOut() {
  mockSignedIn = false;
  const storage = getStorage();
  storage?.removeItem(SESSION_STORAGE_KEY);
}
