import type { UserProfile } from '@/domain';

export type SignInInput = {
  username: string;
  password: string;
};

export type RegisterAccountInput = {
  username: string;
  password: string;
  nickname: string;
  realName: string;
  displayNamePreference: 'nickname' | 'realName';
  phone: string;
  provinceName: string;
  cityName?: string;
  districtName: string;
  addressDetail: string;
  birthDate: string;
  phoneVerificationToken?: string;
};

export type FindUsernameInput = {
  realName: string;
  phone: string;
  birthDate: string;
};

export type ResetPasswordInput = {
  username: string;
  realName: string;
  phone: string;
  birthDate: string;
  newPassword: string;
  // Verified 'reset' phone-challenge token. The backend requires it, so the reset
  // POST is rejected client-side (before the network) when it is missing.
  phoneVerificationToken?: string;
};

export type SessionSnapshot = {
  mode: 'mock' | 'backend';
  signedIn: boolean;
  accessToken?: string | null;
  profile?: UserProfile | null;
};

export type BackendSessionState = {
  accessToken: string | null;
  profile: UserProfile | null;
};
