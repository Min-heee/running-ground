import type { AppNotice } from '@/domain';

export type AdminOverviewResponse = {
  environment: string;
  publicBaseUrl?: string;
  counts: {
    users: number;
    runs: number;
    marketItems: number;
    activeMarketItems: number;
    offlineRaceEvents: number;
    activeOfflineRaceEvents: number;
    notices: number;
    activeNotices: number;
    rewardRedemptions: number;
    sessions: number;
  };
};

export type AdminSessionResponse = {
  success: true;
  environment: string;
  publicBaseUrl?: string;
};

export type AdminUserSummary = {
  id: string;
  username: string;
  name: string;
  realName?: string;
  phone?: string;
  birthDate?: string;
  publicTag: string;
  provinceName?: string;
  cityName?: string;
  districtName: string;
  createdAt?: string;
  lifetimeDistanceKm: number;
  currentWeekDistanceKm: number;
  currentWeekPoints: number;
  totalRuns: number;
  connectedSourceCount: number;
};

export type AdminUsersResponse = {
  users: AdminUserSummary[];
};

export type AdminDeleteUserResponse = {
  success: boolean;
  deletedUserId: string;
  users: AdminUserSummary[];
};

export type AdminMarketItem = {
  id: string;
  title: string;
  category: string;
  description: string;
  costPoints: number;
  partnerName?: string;
  repeatable: boolean;
  isActive: boolean;
  inventoryCount: number | null;
  remainingStock: number | null;
  redemptionCount: number;
};

export type AdminMarketCatalogResponse = {
  items: AdminMarketItem[];
};

export type AdminMarketItemInput = {
  title: string;
  category: string;
  description: string;
  costPoints: number;
  partnerName?: string;
  repeatable: boolean;
  isActive: boolean;
  inventoryCount?: number | null;
};

export type AdminMarketItemActionResponse = {
  success: boolean;
  item: AdminMarketItem;
  items: AdminMarketItem[];
};

export type AdminRewardRedemption = {
  id: string;
  userId: string;
  userName: string;
  userTag: string;
  itemId: string;
  itemTitle: string;
  costPoints: number;
  status: 'requested' | 'fulfilled' | 'cancelled';
  claimedAt: string;
  adminNote?: string;
  fulfilledAt?: string;
};

export type AdminRewardRedemptionsResponse = {
  items: AdminRewardRedemption[];
};

export type UpdateAdminRewardRedemptionInput = {
  status: 'requested' | 'fulfilled' | 'cancelled';
  adminNote?: string;
};

export type AdminRewardRedemptionActionResponse = {
  success: boolean;
  item: AdminRewardRedemption;
  items: AdminRewardRedemption[];
};

export type AdminNotice = AppNotice;

export type AdminNoticesResponse = {
  items: AdminNotice[];
};

export type AdminNoticeInput = {
  title: string;
  message: string;
  priority: number;
  isActive: boolean;
};

export type AdminNoticeActionResponse = {
  success: boolean;
  item: AdminNotice;
  items: AdminNotice[];
};

export type AdminOfflineRaceEvent = {
  id: string;
  title: string;
  subtitle: string;
  distanceKm: number;
  startsAt: string;
  registrationClosesAt: string;
  participationMode: string;
  proofMethod: string;
  runWindowMinutes: number;
  hostLabel: string;
  participantCount: number;
  capacity: number;
  entryFeePoints: number;
  operationNote: string;
  status: 'registration_open' | 'registration_closing' | 'registration_closed' | 'live' | 'finished';
};

export type AdminOfflineRaceEventsResponse = {
  events: AdminOfflineRaceEvent[];
};

export type AdminOfflineRaceEventInput = {
  title: string;
  subtitle: string;
  distanceKm: number;
  startsAt: string;
  registrationClosesAt: string;
  participationMode: string;
  proofMethod: string;
  runWindowMinutes: number;
  hostLabel: string;
  capacity: number;
  entryFeePoints: number;
  operationNote: string;
};

export type AdminOfflineRaceEventActionResponse = {
  success: boolean;
  event: AdminOfflineRaceEvent;
  events: AdminOfflineRaceEvent[];
};
