import type {
  ConnectedSource,
  MyRunRecord,
  RunMatchResult,
  RunRoutePoint,
  RunSourceType,
} from '@/domain';
import type { ChaseSettlementSummary } from './chase';

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
  chaseArenaId?: string;
};

export type CreateTrackedRunResponse = RunDetailResponse & {
  // 경찰과 도둑런: 업로드 직후 소급 정산 요약 (chase 러닝일 때만).
  chaseSettlement?: ChaseSettlementSummary;
};

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
  // Entries the server dropped as pre-launch-dated (launch-date import cutoff).
  // Optional/additive: older backends never send it, and no consumer requires it.
  skippedPreLaunch?: number;
};

export type RunPointBreakdown = {
  levelPoints: number;
  streakPoints: number;
  growthPoints: number;
  matchBonusPoints: number;
  // 경찰과 도둑런 보너스 — 구버전 서버 응답에는 없으므로 optional.
  chasePoints?: number;
  totalPoints: number;
};

export type RunDetailResponse = {
  run: MyRunRecord;
  weeklyDistanceKm: number;
  estimatedMinutes: number;
  earnedPoint: number;
  pointBreakdown: RunPointBreakdown;
};
