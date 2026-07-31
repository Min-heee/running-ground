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

// Phone verification is shared by signup, password reset, and 아이디 찾기; the backend keys the
// challenge on this purpose and only accepts a token issued for the matching flow.
export type PhoneVerificationPurpose = 'signup' | 'reset' | 'find_username';

export type RequestPhoneVerificationCodeResponse = {
  success: boolean;
  purpose: PhoneVerificationPurpose;
  requestId: string;
  maskedPhone: string;
  expiresAt: string;
  resendAvailableAt: string;
  provider: 'mock' | 'solapi';
  testCode?: string;
};

export type VerifyPhoneVerificationCodeResponse = {
  success: boolean;
  purpose: PhoneVerificationPurpose;
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

export type MyProfileResponse = UserProfile & {
  rankState: RankState;
};

export type NotificationSettingsResponse = {
  friendAlerts: boolean;
  districtAlerts: boolean;
  marketAlerts: boolean;
  matchReminders: boolean;
  // 라이브 러닝 공개 + 응원 메시지 수신 (오너 2026-07-31). 구버전 서버 응답에는 없을 수
  // 있어 optional — 없으면 켬으로 취급한다(서버 기본값과 동일).
  liveRunPublic?: boolean;
  cheerAlerts?: boolean;
};

// 원격 푸시 토큰 등록 — 공지 푸시 대상 저장용.
export type RegisterPushTokenInput = {
  token: string;
  platform: 'ios' | 'android';
};

// 문의하기 (오너 2026-07-31) — 유저는 제목/내용만 보내고, 관리자 답변이 replies로 실린다.
export type MyInquiryReply = {
  id: string;
  body: string;
  createdAt: string;
};

export type MyInquiry = {
  id: string;
  title: string;
  body: string;
  status: 'pending' | 'answered';
  createdAt: string;
  replies: MyInquiryReply[];
};

export type MyInquiriesResponse = {
  inquiries: MyInquiry[];
};

export type CreateInquiryInput = {
  title: string;
  body: string;
};

export type CreateInquiryResponse = {
  inquiry: MyInquiry;
};

export type UpdateMyProfileInput = {
  name: string;
  // Tag code with or without '#' — the server normalizes to '#CODE' (uppercase
  // alphanumerics, 3~8 chars) and rejects duplicates with a 409.
  publicTag?: string;
  // Trimmed server-side; max 40 chars; empty string clears it.
  statusMessage?: string;
};

export type UpdateMyProfileResponse = MyProfileResponse;

// GET /me/tag-availability?code=… — 태그 실시간 중복확인. 형식 오류도 200 +
// available:false로 내려온다 (저장 시 409가 최종 권위).
export type TagAvailabilityResponse = {
  available: boolean;
  reason: 'format' | 'own' | 'taken' | 'free';
  message: string;
};

export type UpdateMyRegionInput = {
  provinceName: string;
  cityName?: string;
  districtName: string;
};

export type UpdateMyRegionResponse = MyProfileResponse;

export type UpdateNotificationSettingsInput = NotificationSettingsResponse;

export type UpdateNotificationSettingsResponse = NotificationSettingsResponse;
