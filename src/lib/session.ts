let mockSignedIn = false;

export function getIsSignedIn() {
  return mockSignedIn;
}

export function signIn() {
  mockSignedIn = true;
}

export function signOut() {
  mockSignedIn = false;
}
