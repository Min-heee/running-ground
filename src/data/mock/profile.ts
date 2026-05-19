import type { UserProfile } from '@/domain';

export const myProfile: UserProfile = {
  name: '민병희',
  provinceName: '서울특별시',
  districtName: '강남구',
  addressDetail: '테헤란로 123',
  publicTag: '#BH7K2',
  lifetimeDistanceKm: 126.8,
};

export const myNotificationSettings = {
  friendAlerts: true,
  districtAlerts: true,
  marketAlerts: false,
  matchReminders: true,
};
