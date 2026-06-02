import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_STORAGE_KEY = 'runnigapp.mock.session';
const SIGNED_IN_VALUE = 'signed-in';

let mockSignedIn = false;

export async function hydrateSession() {
  try {
    const storedValue = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
    mockSignedIn = storedValue === SIGNED_IN_VALUE;
  } catch {
    mockSignedIn = false;
  }
  return mockSignedIn;
}

export function getIsSignedIn() {
  return mockSignedIn;
}

export async function signIn() {
  mockSignedIn = true;
  await AsyncStorage.setItem(SESSION_STORAGE_KEY, SIGNED_IN_VALUE);
}

export async function signOut() {
  mockSignedIn = false;
  await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
}
