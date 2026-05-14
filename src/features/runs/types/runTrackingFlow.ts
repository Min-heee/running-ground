import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AppStateStatus } from 'react-native';

import type { RunRoutePoint } from '@/domain';
import type { LastSyncedMatchProgress } from '@/features/runs/viewModels/matchProgress';
import type { MatchLifecycleController } from '@/features/runs/lifecycle/matchLifecycleController';
import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { TrackerStatus } from '@/features/runs/hooks/useRunTracking';
import type { OfficialStartBaseline } from '@/features/runs/tracking/trackingSession';
import type {
  RunningMatchState,
  RunningMatchStatusResponse,
  UpdateRunningMatchProgressInput,
} from '@/lib/api/types';

export type DisplayedTrackingSnapshot = {
  route: RunRoutePoint[];
  distanceKm: number;
  elevationGainM: number;
  currentPace: string;
  elapsedSeconds: number;
  startedAt?: string | null;
};

export type DisplayedMatchProgress = Pick<UpdateRunningMatchProgressInput, 'distanceKm' | 'elapsedSeconds' | 'currentPace'>;

export type SyncLiveSharingInput = {
  enabled: boolean;
  status: 'idle' | 'paused' | 'running';
  locationLabel?: string | null;
};

export type UseRunTrackingFlowInput = {
  pedometerSubscriptionRef: MutableRefObject<{ remove: () => void } | null>;
  timerRef: MutableRefObject<ReturnType<typeof setInterval> | null>;
  soloStartCountdownTimerRef: MutableRefObject<ReturnType<typeof setInterval> | null>;
  soloStartCountdownResolveRef: MutableRefObject<((completed: boolean) => void) | null>;
  routeRef: MutableRefObject<RunRoutePoint[]>;
  elapsedSecondsRef: MutableRefObject<number>;
  totalStepsRef: MutableRefObject<number>;
  pedometerStepOffsetRef: MutableRefObject<number>;
  liveShareEnabledRef: MutableRefObject<boolean>;
  liveShareLabelRef: MutableRefObject<string | null>;
  liveShareHeartbeatRef: MutableRefObject<number>;
  matchProgressHeartbeatRef: MutableRefObject<number>;
  appStateRef: MutableRefObject<AppStateStatus>;
  trackerStatusRef: MutableRefObject<TrackerStatus>;
  officialStartBaselineRef: MutableRefObject<OfficialStartBaseline | null>;
  matchModeRef: MutableRefObject<RunMatchMode>;
  roomLinkedMatchContextRef: MutableRefObject<PartyRunLinkedMatchContext | null>;
  duelMatchStatusRef: MutableRefObject<RunningMatchStatusResponse | null>;
  groupMatchStatusRef: MutableRefObject<RunningMatchStatusResponse | null>;
  autoStartingMatchTrackingRef: MutableRefObject<boolean>;
  autoStartedMatchIdRef: MutableRefObject<string | null>;
  preStartWarmupMatchIdRef: MutableRefObject<string | null>;
  matchMode: RunMatchMode;
  duelMatchState: RunningMatchState;
  groupMatchState: RunningMatchState;
  duelMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatus: RunningMatchStatusResponse | null;
  roomLinkedMatchContext: PartyRunLinkedMatchContext | null;
  status: TrackerStatus;
  visiblePartyRunShouldOpenArena: boolean;
  duelStartCountdownSeconds: number | null;
  groupStartCountdownSeconds: number | null;
  setStatus: Dispatch<SetStateAction<TrackerStatus>>;
  setSoloStartCountdownSeconds: Dispatch<SetStateAction<number | null>>;
  setRoute: Dispatch<SetStateAction<RunRoutePoint[]>>;
  setDistanceKm: Dispatch<SetStateAction<number>>;
  setElapsedSeconds: Dispatch<SetStateAction<number>>;
  setCurrentPace: Dispatch<SetStateAction<string>>;
  setLastSyncedMatchProgress: Dispatch<SetStateAction<LastSyncedMatchProgress | null>>;
  setDuelMatchStatus: Dispatch<SetStateAction<RunningMatchStatusResponse | null>>;
  setGroupMatchStatus: Dispatch<SetStateAction<RunningMatchStatusResponse | null>>;
  setElevationGainM: Dispatch<SetStateAction<number>>;
  setCadenceSpm: Dispatch<SetStateAction<number | null>>;
  setLocationPermissionGranted: Dispatch<SetStateAction<boolean | null>>;
  setBackgroundLocationPermissionGranted: Dispatch<SetStateAction<boolean | null>>;
  setMotionPermissionGranted: Dispatch<SetStateAction<boolean | null>>;
  setLiveShareLabel: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  officialStartDistanceNoiseGraceSeconds: number;
  officialStartDistanceNoiseGraceKm: number;
  soloStartCountdownSeconds: number;
  getSyncedNowMs: () => number;
  refreshStaleMatchArtifacts: () => Promise<unknown>;
  matchProgressHeartbeatEnabled?: boolean;
  matchLifecycleController?: MatchLifecycleController;
};
