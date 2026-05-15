import type {
  DuelMatchOpponent,
  RunningMatchRoomMode,
  RunningMatchRoomState,
  RunningMatchState,
} from '@/lib/api/types';

export type MatchParticipantLiveStatus = DuelMatchOpponent['liveStatus'];

export type RunTrackingState = 'idle' | 'starting' | 'running' | 'paused' | 'saving';

export type MatchLifecycleState =
  | RunningMatchState
  | RunTrackingState
  | 'forfeited';

export type RunTrackingEvent =
  | 'requestStart'
  | 'start'
  | 'pause'
  | 'resume'
  | 'requestSave'
  | 'saved'
  | 'discard'
  | 'forfeit';

export type PartyRunStartPhase =
  | 'waiting'
  | 'arming'
  | 'readyAcked'
  | 'countdown'
  | 'arenaHandoff'
  | 'active';

export type PartyRunStartPhaseInput = {
  roomState?: RunningMatchRoomState | null;
  linkedMatchStatus?: 'matched' | 'active' | null;
  isCountdownReady?: boolean;
  remainingSeconds?: number | null;
};

export type PartyRunStartEvent =
  | { type: 'hostStartRequested' }
  | { type: 'countdownReadyAcked' }
  | { type: 'serverSnapshot'; payload: PartyRunStartPhaseInput }
  | { type: 'reset' };

export type CountdownVisibilityInput = {
  hasCountdownEntry: boolean;
  remainingSeconds: number | null;
};

export type CenteredCountdownVisibilityInput = CountdownVisibilityInput & {
  showLiveArena: boolean;
  hasRoomCountdownEntry: boolean;
};

export type MatchArenaForceInput = {
  isResolvingFocusedMatch: boolean;
  duelState?: RunningMatchState | null;
  groupState?: RunningMatchState | null;
  duelShouldOpenCountdownArena: boolean;
  groupShouldOpenCountdownArena: boolean;
  roomShouldOpenCountdownArena: boolean;
  forceOpenActiveMatch: boolean;
  shouldKeepRunningMatchArena: boolean;
};

export type MatchArenaEntryInput = {
  duelState?: RunningMatchState | null;
  groupState?: RunningMatchState | null;
  duelShouldOpenCountdownArena: boolean;
  groupShouldOpenCountdownArena: boolean;
};

export type ActiveMatchIdentityInput = {
  matchMode: 'solo' | 'duel' | 'group' | 'room';
  duelMatchId?: string | null;
  groupMatchId?: string | null;
  roomLinkedMatchContext?: {
    mode: 'duel' | 'group';
    matchId: string;
    state: 'matched' | 'active';
  } | null;
};

export type PartyRunLinkedRoomInput = {
  mode: RunningMatchRoomMode;
  state?: RunningMatchRoomState | null;
  distanceKm: number;
  slotStartAt: string;
  linkedMatchId?: string | null;
  linkedMatchStatus?: 'matched' | 'active' | null;
  linkedMatchSlotStartAt?: string | null;
  linkedMatchDistanceKm?: number | null;
};

export type PartyRunFlowSnapshotInput = {
  room?: PartyRunLinkedRoomInput | null;
  isCountdownReady?: boolean;
  remainingSeconds?: number | null;
};

export type PartyRunLinkedMatchContext = {
  mode: RunningMatchRoomMode;
  matchId: string;
  slotStartAt: string;
  distanceKm: number;
  state: 'matched' | 'active';
};

export type PartyRunFlowSnapshot = {
  phase: PartyRunStartPhase;
  hasLinkedMatch: boolean;
  canAcknowledgeCountdownReady: boolean;
  canOpenLinkedMatch: boolean;
  shouldShowLoading: boolean;
  shouldShowCountdown: boolean;
  shouldOpenArena: boolean;
  shouldPreferArena: boolean;
  linkedMatchContext: PartyRunLinkedMatchContext | null;
};
