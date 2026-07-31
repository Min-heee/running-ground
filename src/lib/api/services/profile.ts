import {
  myProfile,
} from '@/data/mock';
import type { UserProfile } from '@/domain';

import {
  getCurrentUserProfile,
  setCurrentUserProfile,
} from '@/lib/session';

import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
} from '../client';

import { USE_MOCK_API } from '../config';

import {
  RegisterPushTokenInput,
  CreateInquiryInput,
  CreateInquiryResponse,
  MyInquiriesResponse,
  MyProfileResponse,
  NotificationSettingsResponse,
  TagAvailabilityResponse,
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
    fallbackMessage: '내 프로필을 불러오지 못했어요.',
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
      ...(input.publicTag !== undefined
        ? { publicTag: `#${input.publicTag.trim().replace(/^#/, '').toUpperCase()}` }
        : {}),
      ...(input.statusMessage !== undefined ? { statusMessage: input.statusMessage.trim() } : {}),
    };

    await setCurrentUserProfile(nextProfile);
    return buildMockProfileResponse(nextProfile);
  }

  const nextProfile = await apiPatch<UpdateMyProfileResponse>(
    '/me/profile',
    {
      name: input.name.trim(),
      ...(input.publicTag !== undefined ? { publicTag: input.publicTag } : {}),
      ...(input.statusMessage !== undefined ? { statusMessage: input.statusMessage } : {}),
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '프로필 저장에 실패했어요.',
    },
  );

  await setCurrentUserProfile(nextProfile);
  return nextProfile;
}

// 태그 실시간 중복확인. 형식 오류도 200 + available:false로 오므로 throw는
// 네트워크/구버전 백엔드(404)뿐 — 호출부는 실패를 '확인 불가'로 조용히 강등한다.
export async function checkMyTagAvailability(code: string): Promise<TagAvailabilityResponse> {
  if (USE_MOCK_API) {
    return { available: true, reason: 'free', message: '사용할 수 있는 태그예요.' };
  }

  return apiGet<TagAvailabilityResponse>(`/me/tag-availability?code=${encodeURIComponent(code)}`, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '태그 확인에 실패했어요.',
  });
}

export async function fetchNotificationSettings(): Promise<NotificationSettingsResponse> {
  if (USE_MOCK_API) {
    return { ...mockApiState.notificationPreferences };
  }

  return apiGet<NotificationSettingsResponse>('/me/notifications', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '알림 설정을 불러오지 못했어요.',
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
      liveRunPublic: input.liveRunPublic !== false,
      cheerAlerts: input.cheerAlerts !== false,
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
      fallbackMessage: '알림 설정 저장에 실패했어요.',
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
      fallbackMessage: '지역 저장에 실패했어요.',
    },
  );

  await setCurrentUserProfile(nextProfile);
  return nextProfile;
}

// 문의하기 — 유저는 제목/내용만 보낸다. 관리자 답변은 목록의 replies로 내려오고
// 답변이 달리면 인박스 알림(inquiry_reply)도 함께 도착한다.
export async function fetchMyInquiries(): Promise<MyInquiriesResponse> {
  return apiGet<MyInquiriesResponse>('/me/inquiries', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '문의 내역을 불러오지 못했어요.',
  });
}

export async function createMyInquiry(input: CreateInquiryInput): Promise<CreateInquiryResponse> {
  return apiPost<CreateInquiryResponse>('/me/inquiries', input, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '문의를 보내지 못했어요.',
  });
}

// 원격 푸시 토큰 — 공지 푸시 발송 대상. 등록 실패는 호출부가 조용히 삼킨다.
export async function registerPushToken(input: RegisterPushTokenInput): Promise<{ success: boolean }> {
  return apiPost<{ success: boolean }>('/me/push-token', input, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '푸시 알림을 등록하지 못했어요.',
  });
}

export async function unregisterPushToken(token: string): Promise<{ success: boolean }> {
  return apiDelete<{ success: boolean }>(`/me/push-token?token=${encodeURIComponent(token)}`, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '푸시 알림을 해제하지 못했어요.',
  });
}
