import { AppNotice, ConnectedSource, DistrictPersonalRank, FriendRank, FriendRequest, FriendRunRecord, MarketOverview, MyRunRecord, OfflineRaceEvent, OfflineRaceHub, RegionDrilldownNode, RunMatchResult, RunRoutePoint, RunSourceType, UniversityLeagueRank, UserProfile, WeeklySummary } from '@/domain/types';
import { AddressRegionNode } from '@/features/location/addressCatalog';

export type HomeSummaryResponse = WeeklySummary;
export type MarketOverviewResponse = MarketOverview;
export type OfflineRaceHubResponse = OfflineRaceHub;
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

export type CreateManualRunInput = {
  date: string;
  distanceKm: number;
  pace: string;
};

export type CreateManualRunResponse = RunDetailResponse;

export type CreateTrackedRunInput = {
  date: string;
  distanceKm: number;
  pace: string;
  durationSeconds: number;
  cadenceSpm?: number | null;
  elevationGainM?: number | null;
  route: RunRoutePoint[];
  startedAt: string;
  endedAt: string;
  matchResult?: RunMatchResult;
};

export type CreateTrackedRunResponse = RunDetailResponse;

export type UpdateRunningLiveShareInput = {
  enabled: boolean;
  status: 'idle' | 'paused' | 'running';
  locationLabel?: string;
};

export type UpdateRunningLiveShareResponse = {
  success: boolean;
  liveSharingEnabled: boolean;
  isRunningNow: boolean;
  locationLabel?: string;
  updatedAt: string;
};

export type RequestDuelMatchInput = {
  distanceKm: number;
  slotStartAt: string;
  testMode?: boolean;
};

export type DuelMatchOpponent = {
  id: string;
  name: string;
  tag?: string;
  districtName: string;
  averagePace: string;
  levelLabel: string;
  weeklyDistanceKm: number;
  lifetimeDistanceKm: number;
  compatibilitySummary: string;
  accepted?: boolean;
  liveDistanceKm?: number;
  liveElapsedSeconds?: number;
  livePace?: string;
  liveUpdatedAt?: string;
  liveStatus?: 'ready' | 'running' | 'background' | 'paused' | 'disconnected' | 'forfeited' | 'finished';
  finishedAt?: string;
};

export type RequestDuelMatchResponse = {
  success: boolean;
  matched: boolean;
  isTestMatch?: boolean;
  requestId: string;
  distanceKm: number;
  slotStartAt: string;
  slotLabel: string;
  paceBandLabel: string;
  levelBandLabel: string;
  criteriaSummary: string;
  estimatedWaitMinutes: number;
  opponent?: DuelMatchOpponent;
};

export type RequestGroupMatchInput = {
  distanceKm: number;
  slotStartAt: string;
  testMode?: boolean;
};

export type GroupMatchParticipant = {
  id: string;
  name: string;
  tag?: string;
  districtName: string;
  averagePace: string;
  levelLabel: string;
  weeklyDistanceKm: number;
  lifetimeDistanceKm: number;
  seedRank: number;
  seedSummary: string;
  accepted?: boolean;
  liveDistanceKm?: number;
  liveElapsedSeconds?: number;
  livePace?: string;
  liveUpdatedAt?: string;
  liveStatus?: 'ready' | 'running' | 'background' | 'paused' | 'disconnected' | 'forfeited' | 'finished';
  finishedAt?: string;
};

export type RunningMatchState = 'idle' | 'waiting' | 'matched' | 'active';

export type FetchRunningMatchStatusInput = {
  mode: 'duel' | 'group';
  distanceKm: number;
  slotStartAt: string;
  testMode?: boolean;
};

export type AcceptRunningMatchInput = {
  matchId: string;
};

export type CancelRunningMatchInput = {
  mode: 'duel' | 'group';
  distanceKm: number;
  slotStartAt: string;
  testMode?: boolean;
  matchId?: string;
};

export type LeaveRunningMatchInput = {
  matchId: string;
};

export type UpdateRunningMatchProgressInput = {
  matchId: string;
  distanceKm: number;
  elapsedSeconds: number;
  currentPace: string;
  status: 'running' | 'background' | 'paused' | 'finished';
};

export type RunningMatchStatusResponse = {
  success: boolean;
  mode: 'duel' | 'group';
  state: RunningMatchState;
  isTestMatch?: boolean;
  matchId?: string;
  distanceKm: number;
  slotStartAt: string;
  slotLabel: string;
  paceBandLabel: string;
  levelBandLabel: string;
  criteriaSummary: string;
  estimatedWaitMinutes: number;
  participantCount: number;
  competitiveParticipantsCount?: number;
  acceptedCount: number;
  capacity: number;
  userAccepted: boolean;
  readyToStart: boolean;
  canCancel?: boolean;
  cancelableUntilAt?: string;
  countdownRemainingSeconds?: number;
  countdownEndsAt?: string;
  expiresAt?: string;
  expiresInSeconds?: number;
  opponent?: DuelMatchOpponent;
  participants?: GroupMatchParticipant[];
  mySeedRank?: number;
};

export type UpcomingRunningMatchItem = {
  matchId: string;
  mode: 'duel' | 'group';
  isTestMatch?: boolean;
  distanceKm: number;
  slotStartAt: string;
  slotLabel: string;
  status: 'matched' | 'active';
  participantCount: number;
  counterpartLabel: string;
  summary: string;
  canCancel: boolean;
  cancelableUntilAt: string;
};

export type UpcomingRunningMatchesResponse = {
  items: UpcomingRunningMatchItem[];
};

export type CancelRunningMatchResponse = {
  success: boolean;
};

export type LeaveRunningMatchResponse = {
  success: boolean;
};

export type UpdateRunningMatchProgressResponse = RunningMatchStatusResponse;

export type RequestGroupMatchResponse = {
  success: boolean;
  matched: boolean;
  isTestMatch?: boolean;
  requestId: string;
  distanceKm: number;
  slotStartAt: string;
  slotLabel: string;
  paceBandLabel: string;
  levelBandLabel: string;
  criteriaSummary: string;
  estimatedWaitMinutes: number;
  maxGroupSize: number;
  participantsCount: number;
  mySeedRank?: number;
  participants: GroupMatchParticipant[];
};

export type FetchMatchDemandSummaryInput = {
  mode: 'duel' | 'group';
  distanceKm: number;
  slotStartAt: string;
};

export type MatchDemandSummaryResponse = {
  success: boolean;
  mode: 'duel' | 'group';
  distanceKm: number;
  slotStartAt: string;
  slotLabel: string;
  averagePace: string;
  participantsCount: number;
  competitiveParticipantsCount: number;
  capacity: number;
  fillRatioLabel: string;
  paceBandLabel: string;
  summaryText: string;
};

export type RoutePreviewCoordinate = {
  latitude: number;
  longitude: number;
};

export type CreateRunningRoutePreviewInput = {
  keyword: string;
  desiredDistanceKm: number;
  startLabel: string;
  displayTitle: string;
  description: string;
  roughCoordinates: RoutePreviewCoordinate[];
};

export type CreateRunningRoutePreviewResponse = {
  displayTitle: string;
  description: string;
  startLabel: string;
  requestedKeyword: string;
  requestedDistanceKm: number;
  estimatedDistanceKm: number;
  coordinates: RoutePreviewCoordinate[];
  provider: 'template';
  roadFollowed: boolean;
  warning?: string;
};

export type MyActivityResponse = {
  runs: MyRunRecord[];
  monthlyDistanceKm: number;
  monthlyPoints: number;
};

export type FriendLeaderboardResponse = {
  ranks: FriendRank[];
  requests: FriendRequest[];
};

export type FriendActivityResponse = {
  friend: FriendRank;
  runs: FriendRunRecordsResponse;
  monthlyDistanceKm: number;
  monthlyPoints: number;
};

export type FriendRunRecordsResponse = FriendRunRecord[];

export type IntegrationStatusResponse = {
  sources: ConnectedSource[];
};

export type IntegrationSyncResponse = {
  success: boolean;
  syncedSources: number;
  scannedRuns: number;
  importedRuns: number;
  duplicateRuns: number;
  syncedRuns: number;
  lastSyncedAt: string;
};

export type IntegrationSourceActionInput = {
  sourceType: RunSourceType;
};

export type IntegrationSourceActionResponse = {
  success: boolean;
  source: ConnectedSource;
  sources: ConnectedSource[];
};

export type QueueIntegrationImportResponse = {
  success: boolean;
  source: ConnectedSource;
  queuedRuns: number;
  pendingRuns: number;
};

export type MarketClaimResponse = {
  success: boolean;
  claimedItemId: string;
  overview: MarketOverview;
};

export type OfflineRaceEntryActionResponse = {
  success: boolean;
  event: OfflineRaceEvent;
};

export type MyProfileResponse = UserProfile;

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

export type UpdateMyProfileResponse = UserProfile;

export type UpdateMyRegionInput = {
  provinceName: string;
  cityName?: string;
  districtName: string;
};

export type UpdateMyRegionResponse = UserProfile;

export type UpdateNotificationSettingsInput = NotificationSettingsResponse;

export type UpdateNotificationSettingsResponse = NotificationSettingsResponse;

export type CreateFriendRequestResponse = {
  success: boolean;
  requestId: string;
  status: 'pending' | 'accepted';
};

export type FriendRequestActionResponse = {
  success: boolean;
  requestId: string;
  status: 'accepted' | 'rejected' | 'cancelled';
};

export type DistrictPersonalResponse = {
  districtName: string;
  myRank: DistrictPersonalRank | null;
  myPoints: number;
  weeklyDistanceKm: number;
  focusRanks: DistrictPersonalRank[];
  ranks: DistrictPersonalRank[];
};

export type RegionBreadcrumbItem = Pick<RegionDrilldownNode, 'id' | 'name' | 'level'>;

export type RegionLeagueResponse = {
  currentNode: RegionDrilldownNode;
  breadcrumb: RegionBreadcrumbItem[];
  children: RegionDrilldownNode[];
};

export type UniversityLeagueResponse = {
  ranks: UniversityLeagueRank[];
};

export type RunPointBreakdown = {
  levelPoints: number;
  streakPoints: number;
  growthPoints: number;
  matchBonusPoints: number;
  totalPoints: number;
};

export type RunDetailResponse = {
  run: MyRunRecord;
  weeklyDistanceKm: number;
  estimatedMinutes: number;
  earnedPoint: number;
  pointBreakdown: RunPointBreakdown;
};

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
  universityName?: string;
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
