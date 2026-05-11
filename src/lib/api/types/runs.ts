import type {
  ConnectedSource,
  MyRunRecord,
  RunMatchResult,
  RunRoutePoint,
  RunSourceType,
} from '@/domain/types';

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
