import type { MutableRefObject, RefObject } from 'react';
import type { ScrollView } from 'react-native';
import type {
  RunningMatchRoom,
  RunningMatchStatusResponse,
} from '@/lib/api/types';
import type {
  PartyRunFlowSnapshot,
  PartyRunLinkedMatchContext,
} from '@/features/runs/matchStateMachine';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';

export type PartyRunSyncCallbacks = {
  getSyncedNowMs: () => number;
  loadMatchRoom: () => Promise<RunningMatchRoom | null>;
  acknowledgeCountdownReady: (roomId: string) => Promise<void>;
  focusRoomLinkedMatch: (
    room: RunningMatchRoom,
    options?: { preferArena?: boolean },
  ) => Promise<RunningMatchStatusResponse | null>;
  syncRoomLinkedMatchStatus: (
    context: PartyRunLinkedMatchContext,
  ) => Promise<RunningMatchStatusResponse | null>;
  loadUpcomingMatches: () => Promise<unknown>;
  onMatchModeChange: (mode: Extract<RunMatchMode, 'duel' | 'group'>) => void;
  onForceOpenActiveMatchChange: (value: boolean) => void;
  onLiveArenaPageChange: (page: number) => void;
  onError: (message: string) => void;
};

export type PartyRunSyncCallbackRef = MutableRefObject<PartyRunSyncCallbacks>;

export type LinkedMatchSyncInput = {
  currentUserId: string;
  matchRoom: RunningMatchRoom | null;
  matchRoomFlow: PartyRunFlowSnapshot;
  visiblePartyRunFlow: PartyRunFlowSnapshot;
  roomLinkedMatchContext: PartyRunLinkedMatchContext | null;
  roomCountdownRemainingSeconds: number | null;
  duelMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatus: RunningMatchStatusResponse | null;
  focusedDuelMatchIdRef: RefObject<string | null>;
  focusedGroupMatchIdRef: RefObject<string | null>;
  livePagerRef: RefObject<ScrollView | null>;
  fastMatchStatusPollMs: number;
  idleMatchStatusPollMs: number;
  callbacksRef: PartyRunSyncCallbackRef;
  enabled?: boolean;
};
