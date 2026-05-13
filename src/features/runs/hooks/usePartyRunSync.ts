import { useRef } from 'react';
import type { RefObject } from 'react';
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
import { useCountdownReadyAck } from '@/features/runs/hooks/partyRunSync/useCountdownReadyAck';
import {
  canOpenPartyRunLinkedMatch,
  useLinkedMatchSync,
} from '@/features/runs/hooks/partyRunSync/useLinkedMatchSync';
import { useRoomPolling } from '@/features/runs/hooks/partyRunSync/useRoomPolling';

type UsePartyRunSyncInput = {
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
  fastRoomPollMs: number;
  idleRoomPollMs: number;
  fastMatchStatusPollMs: number;
  idleMatchStatusPollMs: number;
  linkedMatchSyncEnabled?: boolean;
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

export { canOpenPartyRunLinkedMatch };

export function usePartyRunSync({
  currentUserId,
  matchRoom,
  matchRoomFlow,
  visiblePartyRunFlow,
  roomLinkedMatchContext,
  roomCountdownRemainingSeconds,
  duelMatchStatus,
  groupMatchStatus,
  focusedDuelMatchIdRef,
  focusedGroupMatchIdRef,
  livePagerRef,
  fastRoomPollMs,
  idleRoomPollMs,
  fastMatchStatusPollMs,
  idleMatchStatusPollMs,
  linkedMatchSyncEnabled = true,
  getSyncedNowMs,
  loadMatchRoom,
  acknowledgeCountdownReady,
  focusRoomLinkedMatch,
  syncRoomLinkedMatchStatus,
  loadUpcomingMatches,
  onMatchModeChange,
  onForceOpenActiveMatchChange,
  onLiveArenaPageChange,
  onError,
}: UsePartyRunSyncInput) {
  const callbackRef = useRef({
    getSyncedNowMs,
    loadMatchRoom,
    acknowledgeCountdownReady,
    focusRoomLinkedMatch,
    syncRoomLinkedMatchStatus,
    loadUpcomingMatches,
    onMatchModeChange,
    onForceOpenActiveMatchChange,
    onLiveArenaPageChange,
    onError,
  });

  callbackRef.current = {
    getSyncedNowMs,
    loadMatchRoom,
    acknowledgeCountdownReady,
    focusRoomLinkedMatch,
    syncRoomLinkedMatchStatus,
    loadUpcomingMatches,
    onMatchModeChange,
    onForceOpenActiveMatchChange,
    onLiveArenaPageChange,
    onError,
  };

  useRoomPolling({
    matchRoom,
    fastRoomPollMs,
    idleRoomPollMs,
    callbacksRef: callbackRef,
  });
  useCountdownReadyAck({
    currentUserId,
    matchRoom,
    matchRoomFlow,
    callbacksRef: callbackRef,
  });
  useLinkedMatchSync({
    currentUserId,
    matchRoom,
    matchRoomFlow,
    visiblePartyRunFlow,
    roomLinkedMatchContext,
    roomCountdownRemainingSeconds,
    duelMatchStatus,
    groupMatchStatus,
    focusedDuelMatchIdRef,
    focusedGroupMatchIdRef,
    livePagerRef,
    fastMatchStatusPollMs,
    idleMatchStatusPollMs,
    enabled: linkedMatchSyncEnabled,
    callbacksRef: callbackRef,
  });
}
