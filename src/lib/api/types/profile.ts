import type {
  AppNotice,
  RankState,
  UserProfile,
  WeeklySummary,
} from '@/domain';
import type { AddressRegionNode } from '@/features/location/addressCatalog';

export type HomeSummaryResponse = WeeklySummary;

export type ActiveNoticesResponse = {
  items: AppNotice[];
};

export type AuthResponse = {
  accessToken: string;
  user: UserProfile;
};

export type UsernameAvailabilityResponse = {
  username: string;
  available: boolean;
  message: string;
};

export type RequestPhoneVerificationCodeResponse = {
  success: boolean;
  purpose: 'signup';
  requestId: string;
  maskedPhone: string;
  expiresAt: string;
  resendAvailableAt: string;
  provider: 'mock' | 'solapi';
  testCode?: string;
};

export type VerifyPhoneVerificationCodeResponse = {
  success: boolean;
  purpose: 'signup';
  phone: string;
  maskedPhone: string;
  verifiedAt: string;
  registrationExpiresAt: string;
  verifiedToken: string;
};

export type FindUsernameResponse = {
  success: boolean;
  username: string;
  maskedPhone: string;
};

export type ResetPasswordResponse = {
  success: boolean;
  username: string;
  message: string;
};

export type LogoutResponse = {
  success: boolean;
};

export type DeleteMyAccountResponse = {
  success: boolean;
  deletedUserId: string;
};

export type RegionCatalogResponse = {
  regions: AddressRegionNode[];
};

export type UniversityCatalogResponse = {
  universities: string[];
};

export type MyProfileResponse = UserProfile & {
  rankState: RankState;
};

export type NotificationSettingsResponse = {
  friendAlerts: boolean;
  districtAlerts: boolean;
  marketAlerts: boolean;
  matchReminders: boolean;
};

export type UpdateMyProfileInput = {
  name: string;
  universityName?: string;
};

export type UpdateMyProfileResponse = MyProfileResponse;

export type UpdateMyRegionInput = {
  provinceName: string;
  cityName?: string;
  districtName: string;
};

export type UpdateMyRegionResponse = MyProfileResponse;

export type UpdateNotificationSettingsInput = NotificationSettingsResponse;

export type UpdateNotificationSettingsResponse = NotificationSettingsResponse;
