import type { Dispatch, SetStateAction } from 'react';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { useMatchEntryEffects } from '@/features/runs/lifecycle/hooks/useMatchEntryEffects';
import { useLiveMatchNavigationEffects } from '@/features/runs/lifecycle/hooks/useLiveMatchNavigationEffects';
import { useSyncedCountdownTicker } from '@/features/runs/lifecycle/hooks/useSyncedCountdownTicker';
import { useStaleMatchCleanup } from '@/features/runs/sync/matchPolling/useStaleMatchCleanup';
import { useUpcomingMatchPolling } from '@/features/runs/sync/matchPolling/useUpcomingMatchPolling';
import { useBlockingMatchStatusPolling } from '@/features/runs/sync/matchPolling/useBlockingMatchStatusPolling';
import { usePartyRunSync } from '@/features/runs/sync/usePartyRunSync';
import { useTrackRunNotificationSync } from '@/features/runs/hooks/useTrackRunNotificationSync';
import type {
  FriendLeaderboardResponse,
  MatchDemandSummaryResponse,
  RunningMatchRoom,
  RunningMatchStatusResponse,
} from '@/lib/api/types';

export type LoadMatchStatusOptions = {
  distanceKm?: number;
  forceAccept?: boolean;
  matchId?: string;
  testMode?: boolean;
};

export type LoadMatchRoomOptions = {
  ignoreDuringInteraction?: boolean;
  localActiveMatchId?: string | null;
  localActiveRoomId?: string | null;
  priority?: 'normal' | 'low-priority';
  requireLocalActiveHint?: boolean;
};

export type TrackRunIdleEffectModel = {
  activeMatchId: string | null;
  activeRoomCheckPriority: 'normal' | 'low-priority';
  activeRoomId: string | null;
  hasLocalActiveHint: boolean;
  idleReason: string;
  isUserActionPending: boolean;
  shouldRunActiveRoomCheck: boolean;
};

export type DirectStatusEffectsInput = {
  activeDuelSlotStartAt: string;
  activeGroupSlotStartAt: string;
  duelDistanceKm: number;
  focusRequestedDuelTest: boolean;
  focusRequestedGroupTest: boolean;
  groupDistanceKm: number;
  isDuelTestFlow: boolean;
  isGroupTestFlow: boolean;
  loadDuelMatchStatus: (slotStartAt?: string, options?: LoadMatchStatusOptions) => Promise<RunningMatchStatusResponse>;
  loadGroupMatchStatus: (slotStartAt?: string, options?: LoadMatchStatusOptions) => Promise<RunningMatchStatusResponse>;
  matchMode: RunMatchMode;
  roomLinkedMatchMode: 'duel' | 'group' | null;
  setDuelMatchStatus: Dispatch<SetStateAction<RunningMatchStatusResponse | null>>;
  setGroupMatchStatus: Dispatch<SetStateAction<RunningMatchStatusResponse | null>>;
};

export type DemandSummaryEffectsInput = {
  duelDistanceKm: number;
  duelSlotStartAt: string;
  groupDistanceKm: number;
  groupSlotStartAt: string;
  matchMode: RunMatchMode;
  setDuelDemandSummary: Dispatch<SetStateAction<MatchDemandSummaryResponse | null>>;
  setGroupDemandSummary: Dispatch<SetStateAction<MatchDemandSummaryResponse | null>>;
  setIsLoadingDuelDemandSummary: Dispatch<SetStateAction<boolean>>;
  setIsLoadingGroupDemandSummary: Dispatch<SetStateAction<boolean>>;
};

export type InitialLoadEffectsInput = {
  commitMatchRoom: (room: RunningMatchRoom | null) => void;
  loadFriendLeaderboardData: () => Promise<FriendLeaderboardResponse>;
  loadMatchRoom: (options?: LoadMatchRoomOptions) => Promise<RunningMatchRoom | null>;
  setFriendLeaderboard: Dispatch<SetStateAction<FriendLeaderboardResponse | null>>;
  trackRunIdleViewModel: TrackRunIdleEffectModel;
};

export type RuntimeHydrationEffectsInput = {
  demandSummaryEffects: DemandSummaryEffectsInput;
  directStatusEffects: DirectStatusEffectsInput;
  initialLoadEffects: InitialLoadEffectsInput;
};

export type RuntimeCleanupEffectsInput = {
  staleMatchCleanup: Parameters<typeof useStaleMatchCleanup>[0];
};

export type RuntimeNavigationEffectsInput = {
  liveMatchNavigationEffects: Parameters<typeof useLiveMatchNavigationEffects>[0];
  matchEntryEffects: Parameters<typeof useMatchEntryEffects>[0];
  notificationSync: Parameters<typeof useTrackRunNotificationSync>[0];
  partyRunSync: Parameters<typeof usePartyRunSync>[0];
};

export type RuntimeTimerEffectsInput = {
  blockingMatchStatusPolling: Parameters<typeof useBlockingMatchStatusPolling>[0];
  countdownTicker: Parameters<typeof useSyncedCountdownTicker>[0];
  upcomingMatchPolling: Parameters<typeof useUpcomingMatchPolling>[0];
};

export type UseTrackRunRuntimeEffectsInput =
  RuntimeHydrationEffectsInput
  & RuntimeCleanupEffectsInput
  & RuntimeNavigationEffectsInput
  & RuntimeTimerEffectsInput;
