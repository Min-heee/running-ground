import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ScrollView } from 'react-native';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { TrackerStatus } from '@/features/runs/hooks/useRunTracking';
import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';
import type { LastSyncedMatchProgress } from '@/features/runs/viewModels/matchProgress';
import type { TrackRunIdleViewModel } from '@/features/runs/viewModels/useTrackRunIdleViewModel';
import type {
  RequestDuelMatchResponse,
  RequestGroupMatchResponse,
  RunningMatchRoom,
  RunningMatchStatusResponse,
  UpcomingRunningMatchItem,
} from '@/lib/api/types';
import type { fetchMatchDemandSummary } from '@/services';

export type LoadMatchRoom = (input?: {
  ignoreDuringInteraction?: boolean;
  localActiveMatchId?: string | null;
  localActiveRoomId?: string | null;
  priority?: 'low-priority' | 'normal';
  requireLocalActiveHint?: boolean;
}) => Promise<RunningMatchRoom | null>;

export type LoadMatchStatus = (
  slotStartAt?: string,
  options?: { testMode?: boolean; distanceKm?: number; matchId?: string; forceAccept?: boolean },
) => Promise<RunningMatchStatusResponse>;

export type UseTrackRunRuntimeMatchActionsInput = {
  activeDuelSlotStartAt: string;
  activeGroupSlotStartAt: string;
  autoStartedMatchIdRef: MutableRefObject<string | null>;
  clearLocalDuelMatchState: (notice?: string | null) => void;
  clearLocalGroupMatchState: (notice?: string | null) => void;
  commitMatchRoom: (room: RunningMatchRoom | null) => void;
  duelDistanceKm: number;
  duelMatchResult: RequestDuelMatchResponse | null;
  duelMatchState: string;
  duelMatchStatus: RunningMatchStatusResponse | null;
  forfeitedMatchIdsRef: MutableRefObject<Set<string>>;
  groupDistanceKm: number;
  groupMatchResult: RequestGroupMatchResponse | null;
  groupMatchState: string;
  groupMatchStatus: RunningMatchStatusResponse | null;
  isDuelTestFlow: boolean;
  isGroupTestFlow: boolean;
  latestMatchRoomServerNowMsRef: MutableRefObject<number>;
  livePagerRef: MutableRefObject<ScrollView | null>;
  loadDuelMatchStatus: LoadMatchStatus;
  loadGroupMatchStatus: LoadMatchStatus;
  loadMatchRoom: LoadMatchRoom;
  loadUpcomingMatches: () => Promise<UpcomingRunningMatchItem[]>;
  matchProgressHeartbeatRef: MutableRefObject<number>;
  matchRoom: RunningMatchRoom | null;
  preStartWarmupMatchIdRef: MutableRefObject<string | null>;
  roomLinkedMatchContextRef: MutableRefObject<PartyRunLinkedMatchContext | null>;
  selectedDuelSlot?: { startsAt: string } | null;
  selectedDuelSlotStartAt: string;
  selectedGroupSlot?: { startsAt: string } | null;
  selectedGroupSlotStartAt: string;
  setCancelingUpcomingMatchId: Dispatch<SetStateAction<string | null>>;
  setDuelDemandSummary: Dispatch<SetStateAction<Awaited<ReturnType<typeof fetchMatchDemandSummary>> | null>>;
  setDuelMatchNotice: Dispatch<SetStateAction<string | null>>;
  setDuelMatchResult: Dispatch<SetStateAction<RequestDuelMatchResponse | null>>;
  setDuelMatchStatus: Dispatch<SetStateAction<RunningMatchStatusResponse | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setForceOpenActiveMatch: Dispatch<SetStateAction<boolean>>;
  setGroupDemandSummary: Dispatch<SetStateAction<Awaited<ReturnType<typeof fetchMatchDemandSummary>> | null>>;
  setGroupMatchNotice: Dispatch<SetStateAction<string | null>>;
  setGroupMatchResult: Dispatch<SetStateAction<RequestGroupMatchResponse | null>>;
  setGroupMatchStatus: Dispatch<SetStateAction<RunningMatchStatusResponse | null>>;
  setIsCancelingDuelMatch: Dispatch<SetStateAction<boolean>>;
  setIsCancelingGroupMatch: Dispatch<SetStateAction<boolean>>;
  setIsRequestingDuelMatch: Dispatch<SetStateAction<boolean>>;
  setIsRequestingGroupMatch: Dispatch<SetStateAction<boolean>>;
  setLastSyncedMatchProgress: Dispatch<SetStateAction<LastSyncedMatchProgress | null>>;
  setLiveArenaPage: Dispatch<SetStateAction<number>>;
  setMatchMode: Dispatch<SetStateAction<RunMatchMode>>;
  setUpcomingMatches: Dispatch<SetStateAction<UpcomingRunningMatchItem[]>>;
  status: TrackerStatus;
  syncServerClock: (serverNow?: string, timingSource?: unknown) => void;
  trackRunIdleViewModel: TrackRunIdleViewModel;
  upcomingMatches: UpcomingRunningMatchItem[];
};
