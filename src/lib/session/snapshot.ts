import type { UserProfile } from '@/domain/types';
import type { SessionSnapshot } from '@/lib/session/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isUserProfile(value: unknown): value is UserProfile {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.name === 'string'
    && (value.provinceName === undefined || typeof value.provinceName === 'string')
    && (value.cityName === undefined || typeof value.cityName === 'string')
    && typeof value.districtName === 'string'
    && (value.universityName === undefined || typeof value.universityName === 'string')
    && (value.addressDetail === undefined || typeof value.addressDetail === 'string')
    && typeof value.publicTag === 'string'
    && (value.lifetimeDistanceKm === undefined || typeof value.lifetimeDistanceKm === 'number');
}

export function readStoredSession(rawValue: string | null) {
  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as SessionSnapshot;

    if (!parsedValue || typeof parsedValue !== 'object') {
      return null;
    }

    if (parsedValue.mode !== 'mock' && parsedValue.mode !== 'backend') {
      return null;
    }

    if (typeof parsedValue.signedIn !== 'boolean') {
      return null;
    }

    return {
      ...parsedValue,
      accessToken: typeof parsedValue.accessToken === 'string' ? parsedValue.accessToken : null,
      profile: isUserProfile(parsedValue.profile) ? parsedValue.profile : null,
    } satisfies SessionSnapshot;
  } catch {
    return null;
  }
}
