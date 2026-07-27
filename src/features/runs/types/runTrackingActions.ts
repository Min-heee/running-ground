import type { MutableRefObject } from 'react';
import type { AppStateStatus } from 'react-native';
import type { rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import type {
  BackgroundRunTrackingSnapshot,
} from '@/features/runs/tracking/background';
import type {
  DisplayedMatchProgress,
  SyncLiveSharingInput,
  UseRunTrackingFlowInput,
} from '@/features/runs/types/runTrackingFlow';
import type { UpdateRunningMatchProgressInput } from '@/lib/api/types';

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type StartTrackingOptions = {
  allowCountdownWarmup?: boolean;
  matchId?: string;
  // 경찰과 도둑런: 서버 입장(join)에 성공한 그 경기장 — 시작 시점의 카드 선택을 다시 읽지
  // 않는다 (입장 왕복/권한 프롬프트 사이에 선택이 바뀌는 경합 차단).
  chaseArena?: {
    arenaId: string;
    arenaName: string;
    latitude: number;
    longitude: number;
    radiusM: number;
  };
};

export type GpsTrackingStartGuard = {
  delayedGpsStartKeyRef: MutableRefObject<string | null>;
  delayedGpsStartTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  skippedAndroidWarmupMatchIdRef: MutableRefObject<string | null>;
  clearDelayedGpsStart: () => void;
  runSingleFlightStart: (
    trackingStartKey: string,
    detail: { matchId?: string | null },
    startWork: () => Promise<void>,
  ) => Promise<void>;
};

export type StopTrackingActionInput = {
  finishSoloStartCountdown: (completed: boolean) => void;
  setError: UseRunTrackingActionsInput['setError'];
  setStatus: UseRunTrackingActionsInput['setStatus'];
  stopForegroundTrackingHelpers: () => void;
  syncLiveSharing: (input: SyncLiveSharingInput) => Promise<unknown>;
};

export type StartTrackingActionInput = Pick<
  UseRunTrackingFlowInput,
  | 'appStateRef'
  | 'officialStartBaselineRef'
  | 'autoStartingMatchTrackingRef'
  | 'autoStartedMatchIdRef'
  | 'preStartWarmupMatchIdRef'
  | 'matchMode'
  | 'duelMatchState'
  | 'groupMatchState'
  | 'duelMatchStatus'
  | 'groupMatchStatus'
  | 'roomLinkedMatchContext'
  | 'setError'
> & {
  androidLiveMatchGpsStartDelayMs: number;
  ensureBackgroundLocationPermission: (options?: { required?: boolean }) => Promise<boolean>;
  ensureLocationPermission: () => Promise<void>;
  gpsStartGuard: GpsTrackingStartGuard;
  handleStartFailure: (trackingError: unknown, endGpsStartTrace: RgPerfEndTrace) => Promise<void>;
  liveShareEnabledRef: UseRunTrackingFlowInput['liveShareEnabledRef'];
  resetForegroundTrackingState: () => void;
  resolveLiveShareLabel: (coordinate?: Coordinate) => Promise<string>;
  runSoloStartCountdown: () => Promise<boolean>;
  syncFromBackgroundTracking: (snapshot?: BackgroundRunTrackingSnapshot) => void;
  syncLiveSharing: (input: SyncLiveSharingInput) => Promise<unknown>;
};

export type PauseResumeTrackingActionsInput = Pick<
  UseRunTrackingFlowInput,
  | 'appStateRef'
  | 'liveShareEnabledRef'
  | 'liveShareLabelRef'
  | 'matchMode'
  | 'duelMatchStatus'
  | 'groupMatchStatus'
  | 'roomLinkedMatchContext'
  | 'setStatus'
  | 'setError'
> & {
  buildDisplayedMatchProgress: (snapshot?: BackgroundRunTrackingSnapshot) => DisplayedMatchProgress;
  ensureBackgroundLocationPermission: (options?: { required?: boolean }) => Promise<boolean>;
  pushRunningMatchProgress: (input: UpdateRunningMatchProgressInput) => Promise<unknown>;
  resolveLiveShareLabel: (coordinate?: Coordinate) => Promise<string>;
  stopForegroundTrackingHelpers: () => void;
  syncFromBackgroundTracking: (snapshot?: BackgroundRunTrackingSnapshot) => void;
  syncLiveSharing: (input: SyncLiveSharingInput) => Promise<unknown>;
};

export type UseRunTrackingActionsInput = Pick<
  UseRunTrackingFlowInput,
  | 'appStateRef'
  | 'liveShareEnabledRef'
  | 'liveShareLabelRef'
  | 'officialStartBaselineRef'
  | 'autoStartingMatchTrackingRef'
  | 'autoStartedMatchIdRef'
  | 'preStartWarmupMatchIdRef'
  | 'matchMode'
  | 'duelMatchState'
  | 'groupMatchState'
  | 'duelMatchStatus'
  | 'groupMatchStatus'
  | 'roomLinkedMatchContext'
  | 'setStatus'
  | 'setError'
> & {
  androidLiveMatchGpsStartDelayMs: number;
  buildDisplayedMatchProgress: (snapshot?: BackgroundRunTrackingSnapshot) => DisplayedMatchProgress;
  ensureBackgroundLocationPermission: (options?: { required?: boolean }) => Promise<boolean>;
  ensureLocationPermission: () => Promise<void>;
  finishSoloStartCountdown: (completed: boolean) => void;
  pushRunningMatchProgress: (input: UpdateRunningMatchProgressInput) => Promise<unknown>;
  resetForegroundTrackingState: () => void;
  resolveLiveShareLabel: (coordinate?: Coordinate) => Promise<string>;
  runSoloStartCountdown: () => Promise<boolean>;
  stopForegroundTrackingHelpers: () => void;
  syncFromBackgroundTracking: (snapshot?: BackgroundRunTrackingSnapshot) => void;
  syncLiveSharing: (input: SyncLiveSharingInput) => Promise<unknown>;
};

export type StartTrackingActionResult = {
  handleStartTracking: (options?: StartTrackingOptions) => Promise<void>;
  startMatchTrackingAutomatically: (
    matchId: string,
    options?: { allowCountdownWarmup?: boolean },
  ) => void;
};

export type AppStateRef = MutableRefObject<AppStateStatus>;
export type RgPerfEndTrace = ReturnType<typeof rgPerfMeasureStart>;
