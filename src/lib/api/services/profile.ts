import {
  myProfile,
} from '@/data/mock';
import type { UserProfile } from '@/domain';

import {
  getCurrentUserProfile,
  setCurrentUserProfile,
} from '@/lib/session';

import {
  apiGet,
  apiPatch,
} from '../client';

import { USE_MOCK_API } from '../config';

import {
  MyProfileResponse,
  NotificationSettingsResponse,
  UpdateNotificationSettingsInput,
  UpdateNotificationSettingsResponse,
  UpdateMyRegionInput,
  UpdateMyRegionResponse,
  UpdateMyProfileInput,
  UpdateMyProfileResponse,
} from '../types';

import {
  mockApiState,
  requireAccessToken,
} from './_shared';

const DEFAULT_PROFILE_RANK_STATE = {
  tier: '입문',
  lp: 0,
};

function buildMockProfileResponse(profile: UserProfile): MyProfileResponse {
  return {
    ...profile,
    rankState: profile.rankState ?? { ...DEFAULT_PROFILE_RANK_STATE },
  };
}

export async function fetchMyProfile(): Promise<MyProfileResponse> {
  if (USE_MOCK_API) {
    return buildMockProfileResponse(getCurrentUserProfile() ?? myProfile);
  }

  const profile = await apiGet<MyProfileResponse>('/me/profile', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '내 프로필을 불러오지 못했어.',
  });

  await setCurrentUserProfile(profile);
  return profile;
}

export async function updateMyProfile(input: UpdateMyProfileInput): Promise<UpdateMyProfileResponse> {
  if (USE_MOCK_API) {
    const currentProfile = getCurrentUserProfile() ?? myProfile;
    const nextProfile = {
      ...currentProfile,
      name: input.name.trim() || currentProfile.name,
    };

    await setCurrentUserProfile(nextProfile);
    return buildMockProfileResponse(nextProfile);
  }

  const nextProfile = await apiPatch<UpdateMyProfileResponse>(
    '/me/profile',
    {
      name: input.name.trim(),
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '프로필 저장에 실패했어.',
    },
  );

  await setCurrentUserProfile(nextProfile);
  return nextProfile;
}

export async function fetchNotificationSettings(): Promise<NotificationSettingsResponse> {
  if (USE_MOCK_API) {
    return { ...mockApiState.notificationPreferences };
  }

  return apiGet<NotificationSettingsResponse>('/me/notifications', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '알림 설정을 불러오지 못했어.',
  });
}

export async function updateNotificationSettings(
  input: UpdateNotificationSettingsInput,
): Promise<UpdateNotificationSettingsResponse> {
  if (USE_MOCK_API) {
    mockApiState.notificationPreferences = {
      friendAlerts: input.friendAlerts,
      districtAlerts: input.districtAlerts,
      marketAlerts: input.marketAlerts,
      matchReminders: input.matchReminders,
    };

    return { ...mockApiState.notificationPreferences };
  }

  return apiPatch<UpdateNotificationSettingsResponse>(
    '/me/notifications',
    {
      friendAlerts: input.friendAlerts,
      districtAlerts: input.districtAlerts,
      marketAlerts: input.marketAlerts,
      matchReminders: input.matchReminders,
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '알림 설정 저장에 실패했어.',
    },
  );
}

export async function updateMyRegion(input: UpdateMyRegionInput): Promise<UpdateMyRegionResponse> {
  if (USE_MOCK_API) {
    const currentProfile = getCurrentUserProfile() ?? myProfile;
    const nextProfile = {
      ...currentProfile,
      provinceName: input.provinceName.trim() || currentProfile.provinceName,
      cityName: input.cityName?.trim() || undefined,
      districtName: input.districtName.trim() || currentProfile.districtName,
    };

    await setCurrentUserProfile(nextProfile);
    return buildMockProfileResponse(nextProfile);
  }

  const nextProfile = await apiPatch<UpdateMyRegionResponse>(
    '/me/region',
    {
      provinceName: input.provinceName.trim(),
      cityName: input.cityName?.trim() ?? '',
      districtName: input.districtName.trim(),
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '지역 저장에 실패했어.',
    },
  );

  await setCurrentUserProfile(nextProfile);
  return nextProfile;
}
