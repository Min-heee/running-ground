import { myProfile } from '@/data/mock';
import type { UserProfile } from '@/domain';
import type { AuthResponse } from '@/lib/api/types';
import {
  buildBackendSessionSnapshot,
  createBackendSession,
  fetchBackendProfile,
} from '@/lib/session/backendSession';
import { readStoredSession } from '@/lib/session/snapshot';
import {
  clearStoredSessionValue,
  getStoredSessionValue,
  setStoredSessionValue,
} from '@/lib/session/storage';
import type { SessionSnapshot } from '@/lib/session/types';
import { USE_MOCK_API } from '@/services/apiClient';

let hydrated = false;
let mockSignedIn = false;
let mockProfile: UserProfile = { ...myProfile };
let backendAccessToken: string | null = null;
let backendProfile: UserProfile | null = null;

async function persistSession() {
  if (USE_MOCK_API) {
    if (!mockSignedIn) {
      await clearStoredSessionValue();
      return;
    }

    const snapshot: SessionSnapshot = {
      mode: 'mock',
      signedIn: true,
      profile: mockProfile,
    };
    await setStoredSessionValue(JSON.stringify(snapshot));
    return;
  }

  if (!backendAccessToken || !backendProfile) {
    await clearStoredSessionValue();
    return;
  }

  const snapshot = buildBackendSessionSnapshot({
    accessToken: backendAccessToken,
    profile: backendProfile,
  });

  if (!snapshot) {
    await clearStoredSessionValue();
    return;
  }

  await setStoredSessionValue(JSON.stringify(snapshot));
}

export function setBackendSession(authResponse: AuthResponse) {
  const backendSession = createBackendSession(authResponse);
  backendAccessToken = backendSession.accessToken;
  backendProfile = backendSession.profile;
}

export async function ensureHydrated() {
  if (!hydrated) {
    await hydrateSession();
  }
}

export async function hydrateSession() {
  const storedSession = readStoredSession(await getStoredSessionValue());

  if (USE_MOCK_API) {
    mockSignedIn = storedSession?.mode === 'mock' && storedSession.signedIn;
    mockProfile = storedSession?.mode === 'mock' && storedSession.profile ? storedSession.profile : { ...myProfile };
    hydrated = true;
    return mockSignedIn;
  }

  backendAccessToken = storedSession?.mode === 'backend' ? storedSession.accessToken ?? null : null;
  backendProfile = storedSession?.mode === 'backend' ? storedSession.profile ?? null : null;

  if (!backendAccessToken) {
    hydrated = true;
    return false;
  }

  try {
    backendProfile = await fetchBackendProfile(backendAccessToken);
    await persistSession();
  } catch {
    backendAccessToken = null;
    backendProfile = null;
    await persistSession();
  }

  hydrated = true;
  return Boolean(backendAccessToken);
}

export function getIsSignedIn() {
  return USE_MOCK_API ? mockSignedIn : Boolean(backendAccessToken);
}

export function getCurrentUserProfile() {
  if (USE_MOCK_API) {
    return mockSignedIn ? mockProfile : null;
  }

  return backendProfile;
}

export async function setCurrentUserProfile(profile: UserProfile) {
  if (USE_MOCK_API) {
    mockProfile = profile;
    await persistSession();
    return mockProfile;
  }

  backendProfile = profile;
  await persistSession();
  return backendProfile;
}

export async function getAccessToken() {
  await ensureHydrated();
  return USE_MOCK_API ? null : backendAccessToken;
}

export async function applyMockSignIn() {
  mockSignedIn = true;
  await persistSession();
  return mockProfile;
}

export async function applyBackendAuthSession(authResponse: AuthResponse) {
  setBackendSession(authResponse);
  await persistSession();
  return authResponse.user;
}

export async function applyMockRegisteredProfile({
  addressDetail,
  cityName,
  districtName,
  displayName,
  provinceName,
}: {
  addressDetail: string;
  cityName: string;
  districtName: string;
  displayName: string;
  provinceName: string;
}) {
  mockProfile = {
    ...mockProfile,
    name: displayName,
    provinceName,
    cityName: cityName || undefined,
    districtName,
    addressDetail,
    publicTag: myProfile.publicTag,
    lifetimeDistanceKm: mockProfile.lifetimeDistanceKm ?? 0,
  };
  mockSignedIn = true;
  await persistSession();
  return mockProfile;
}

export function getBackendAccessToken() {
  return backendAccessToken;
}

export async function clearSession() {
  if (USE_MOCK_API) {
    mockSignedIn = false;
    mockProfile = { ...myProfile };
    await persistSession();
    return;
  }

  backendAccessToken = null;
  backendProfile = null;
  await persistSession();
}
