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

// 케이던스 감사 원장 (오너 규칙 2026-09-09) — 클라 워치독이 **포그라운드·센서 생존 창**에서만
// 누적한 달리기 속도 이동 시간과 그때의 걸음. 서버 runIntegrity는 disqualified 자기신고를
// 'vehicle'(cadence-watchdog)로, 그 외엔 이 원장만으로 백스톱(cadence-audit)을 판정한다 —
// 케이던스 부재 자체(안드로이드 화면 꺼짐)로는 절대 유죄가 아니다.
export type RunCadenceAudit = {
  sensorAvailable: boolean;
  foregroundMovingSeconds: number;
  foregroundSteps: number;
  strikes: number;
  disqualified: boolean;
};

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
  // 선택 필드: 구버전 클라/대기열 재전송엔 없을 수 있고, 서버는 없으면 속도 규칙만 본다.
  cadenceAudit?: RunCadenceAudit;
};

export type CreateTrackedRunResponse = RunDetailResponse & {
  // 경찰과 도둑런: 업로드 직후 소급 정산 요약 (chase 러닝일 때만).
  chaseSettlement?: ChaseSettlementSummary;
};

export type UpdateRunningLiveShareInput = {
  enabled: boolean;
  status: 'idle' | 'paused' | 'running';
  locationLabel?: string;
  // 친구 라이브 지도 재료 (오너 2026-07-31) — 하트비트가 현재 위치/지표를 실어 보낸다.
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  paceLabel?: string;
  // 응원 수신 허용 (마이탭 설정값) — false면 친구의 응원 전송이 서버에서 거절된다.
  allowCheers?: boolean;
};

// 하트비트 응답에 실려오는 응원 — 서버는 전달 즉시 비운다(한 번만 온다).
export type LiveRunCheer = {
  id: string;
  fromName: string;
  message: string;
};

export type UpdateRunningLiveShareResponse = {
  success: boolean;
  cheers?: LiveRunCheer[];
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
  raceEventPoints?: number;
  totalPoints: number;
};

export type RunDetailResponse = {
  run: MyRunRecord;
  weeklyDistanceKm: number;
  estimatedMinutes: number;
  earnedPoint: number;
  pointBreakdown: RunPointBreakdown;
};
