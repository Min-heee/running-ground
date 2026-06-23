import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Href } from 'expo-router';
import type { RunMatchResult, RunRoutePoint } from '@/domain';
import type { BackgroundRunTrackingSnapshot } from '@/features/runs/tracking/background';
import type { MatchExitSource } from '@/features/runs/lifecycle/matchExitFlow';
import type {
  RequestDuelMatchResponse,
  RequestGroupMatchResponse,
  RunningMatchStatusResponse,
  UpdateRunningMatchProgressInput,
} from '@/lib/api/types';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { SaveTrackingOptions, TrackerStatus } from '@/features/runs/hooks/useRunTracking';
import type { ForfeitedMatchSnapshot } from '@/features/runs/types/matchForfeit';

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

export type ContinueSoloOptions = {
  duelNotice?: string;
  groupNotice?: string;
  errorMessage?: string;
};

export type MatchRuntimeResetReason = 'discard-tracking' | 'save-reset';

export type RoomLinkedMatchContext = {
  mode: MatchExitSource;
  matchId: string;
  distanceKm?: number;
  slotStartAt?: string;
  state: 'matched' | 'active';
} | null;

export type UseRunSaveFlowInput = {
  status: TrackerStatus;
  setStatus: Dispatch<SetStateAction<TrackerStatus>>;
  setError: Dispatch<SetStateAction<string | null>>;
  isTabMode: boolean;
  discardRedirectHref: Href | null;
  matchMode: RunMatchMode;
  setMatchMode: Dispatch<SetStateAction<RunMatchMode>>;
  duelMatchStatus: RunningMatchStatusResponse | null;
  setDuelMatchStatus: Dispatch<SetStateAction<RunningMatchStatusResponse | null>>;
  groupMatchStatus: RunningMatchStatusResponse | null;
  setGroupMatchStatus: Dispatch<SetStateAction<RunningMatchStatusResponse | null>>;
  duelMatchNotice: string | null;
  setDuelMatchNotice: Dispatch<SetStateAction<string | null>>;
  groupMatchNotice: string | null;
  setGroupMatchNotice: Dispatch<SetStateAction<string | null>>;
  setDuelMatchResult: Dispatch<SetStateAction<RequestDuelMatchResponse | null>>;
  setGroupMatchResult: Dispatch<SetStateAction<RequestGroupMatchResponse | null>>;
  setIsLeavingDuelMatch: Dispatch<SetStateAction<boolean>>;
  setIsLeavingGroupMatch: Dispatch<SetStateAction<boolean>>;
  setForceOpenActiveMatch: Dispatch<SetStateAction<boolean>>;
  roomLinkedMatchContext: RoomLinkedMatchContext;
  // Durable party-run latch (see partyRunSourceClassifier). True for the whole run once the
  // run is known to have started from a party room, even after the ephemeral
  // roomLinkedMatchContext drops to null on an early forfeit. Combined with the live context so
  // a party run ALWAYS saves/forfeits as 'party'; an official matchmaking match never sets it.
  wasPartyRunRef: MutableRefObject<boolean>;
  trackedMatchResult?: RunMatchResult | null;
  totalStepsRef: MutableRefObject<number>;
  pendingForfeitMatchRef: MutableRefObject<string | null>;
  pendingCounterpartForfeitResultRef: MutableRefObject<boolean>;
  matchProgressHeartbeatRef: MutableRefObject<number>;
  preStartWarmupMatchIdRef: MutableRefObject<string | null>;
  officialStartBaselineRef: MutableRefObject<unknown | null>;
  autoStartedMatchIdRef: MutableRefObject<string | null>;
  focusedDuelMatchIdRef: MutableRefObject<string | null>;
  focusedGroupMatchIdRef: MutableRefObject<string | null>;
  resetMatchRuntimeAfterTrackingCleared: (reason: MatchRuntimeResetReason) => void;
  stopForegroundTrackingHelpers: () => void;
  resetForegroundTrackingState: () => void;
  syncFromBackgroundTracking: (snapshot?: BackgroundRunTrackingSnapshot) => void;
  syncElapsedSeconds: (elapsedSeconds: number) => void;
  getDisplayedTrackingSnapshot: (snapshot?: BackgroundRunTrackingSnapshot) => DisplayedTrackingSnapshot;
  buildDisplayedMatchProgress: (snapshot?: BackgroundRunTrackingSnapshot) => DisplayedMatchProgress;
  pushRunningMatchProgress: (input: UpdateRunningMatchProgressInput) => Promise<RunningMatchStatusResponse>;
  syncLiveSharing: (input: SyncLiveSharingInput) => Promise<unknown>;
  loadUpcomingMatches: () => Promise<unknown>;
  clearLocalForfeitedMatchState: (source: MatchExitSource, matchId: string) => void;
  resetLiveMatchNavigationOwner: () => void;
  markMatchLocallyForfeited: (snapshot: ForfeitedMatchSnapshot) => void;
};

export type RunSaveFlowActions = {
  discardCurrentTracking: () => Promise<void>;
  handleDiscardTracking: () => void;
  handleSaveTracking: (options?: SaveTrackingOptions) => Promise<boolean>;
  leaveMatchAndContinueSolo: (source: MatchExitSource, options?: ContinueSoloOptions) => Promise<void>;
  handleContinueSoloFromMatch: (source: MatchExitSource) => void;
  forfeitMatchAndEndRun: (source: MatchExitSource) => Promise<void>;
  handleForfeitMatch: (source: MatchExitSource) => void;
  handleShowResultAfterCounterpartForfeit: (source: MatchExitSource) => Promise<void>;
  handleShowResultAfterSelfForfeit: (source: MatchExitSource) => Promise<void>;
};
