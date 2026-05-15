import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { ScrollView } from 'react-native';
import type {
  RunningMatchRoom,
  RunningMatchStatusResponse,
} from '@/lib/api/types';
import type { MatchTimeSection } from '@/features/runs/utils/matchScheduling';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { LiveMatchNavigationResult } from '@/features/runs/lifecycle/liveMatchNavigationGate';

export type FocusRunningMatchInput = {
  mode: Extract<RunMatchMode, 'duel' | 'group'>;
  matchId?: string;
  distanceKm?: number;
  slotStartAt?: string;
  isTestMatch?: boolean;
  preferArena?: boolean;
  roomId?: string;
  roomState?: RunningMatchRoom['state'];
  source?: string;
};

export type MarkLiveMatchMountedInput = {
  mode: Extract<RunMatchMode, 'duel' | 'group'>;
  matchId?: string | null;
  source?: string;
};

export type LoadMatchStatusOptions = {
  testMode?: boolean;
  distanceKm?: number;
  matchId?: string;
  forceAccept?: boolean;
};

export type UseRunningMatchFocusInput = {
  livePagerRef: RefObject<ScrollView | null>;
  activeDuelSlotStartAt: string;
  activeGroupSlotStartAt: string;
  focusedDuelMatchIdRef: MutableRefObject<string | null>;
  focusedGroupMatchIdRef: MutableRefObject<string | null>;
  setMatchMode: Dispatch<SetStateAction<RunMatchMode>>;
  setDuelDistanceText: Dispatch<SetStateAction<string>>;
  setGroupDistanceText: Dispatch<SetStateAction<string>>;
  setSelectedDuelSlotStartAt: Dispatch<SetStateAction<string>>;
  setSelectedGroupSlotStartAt: Dispatch<SetStateAction<string>>;
  setSelectedDuelDateKey: Dispatch<SetStateAction<string>>;
  setSelectedGroupDateKey: Dispatch<SetStateAction<string>>;
  setSelectedDuelTimeSection: Dispatch<SetStateAction<MatchTimeSection>>;
  setSelectedGroupTimeSection: Dispatch<SetStateAction<MatchTimeSection>>;
  setLiveArenaPage: Dispatch<SetStateAction<number>>;
  setForceOpenActiveMatch: Dispatch<SetStateAction<boolean>>;
  setIsResolvingFocusedMatch: Dispatch<SetStateAction<boolean>>;
  getSyncedNowMs: () => number;
  isLiveMatchViewConfirmed?: (input: { matchId: string; mode: Extract<RunMatchMode, 'duel' | 'group'> }) => boolean;
  loadDuelMatchStatus: (slotStartAt?: string, options?: LoadMatchStatusOptions) => Promise<RunningMatchStatusResponse>;
  loadGroupMatchStatus: (slotStartAt?: string, options?: LoadMatchStatusOptions) => Promise<RunningMatchStatusResponse>;
};

export type ActiveLiveMatchNavigation = {
  key: string;
  preferArena: boolean;
  promise: Promise<LiveMatchNavigationResult>;
  requestId: string;
};

export type CompletedLiveMatchNavigation = {
  completedAtMs: number;
  key: string;
  preferArena: boolean;
  result: LiveMatchNavigationResult;
};

export type LiveMatchNavigationStatus =
  | 'idle'
  | 'navigating'
  | 'mounted'
  | 'recovering'
  | 'failed'
  | 'suppressed';

export type LiveMatchNavigationRecord = {
  failedCount: number;
  key: string;
  mode: Extract<RunMatchMode, 'duel' | 'group'>;
  nextRetryAtMs?: number;
  owner: string;
  preferArena: boolean;
  requestId?: string;
  result?: LiveMatchNavigationResult;
  status: LiveMatchNavigationStatus;
  updatedAtMs: number;
};
