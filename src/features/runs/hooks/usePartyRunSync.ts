import { useEffect, useRef } from 'react';
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
import type { MatchLifecycleController } from '@/features/runs/matchLifecycleController';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { useCountdownReadyAck } from '@/features/runs/hooks/partyRunSync/useCountdownReadyAck';
import {
  canOpenPartyRunLinkedMatch,
  useLinkedMatchSync,
} from '@/features/runs/hooks/partyRunSync/useLinkedMatchSync';
import { useRoomPolling } from '@/features/runs/hooks/partyRunSync/useRoomPolling';
import { rgPerfMark } from '@/utils/rgPerfTrace';

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
  lifecycleController?: MatchLifecycleController;
  getSyncedNowMs: () => number;
  loadMatchRoom: () => Promise<RunningMatchRoom | null>;
  acknowledgeCountdownReady: (roomId: string) => Promise<void>;
  focusRoomLinkedMatch: (
    room: RunningMatchRoom,
    options?: { preferArena?: boolean; source?: string },
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
  lifecycleController,
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
  const countdownTraceActiveRef = useRef(false);
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

  useEffect(() => {
    const isCountdownActive = visiblePartyRunFlow.phase === 'countdown'
      || roomCountdownRemainingSeconds !== null;

    if (isCountdownActive && !countdownTraceActiveRef.current) {
      countdownTraceActiveRef.current = true;
      rgPerfMark('countdown begin', {
        remainingSeconds: roomCountdownRemainingSeconds ?? null,
        roomId: matchRoom?.roomId ?? null,
        source: 'party-run',
      });
      return;
    }

    if (!isCountdownActive && countdownTraceActiveRef.current) {
      countdownTraceActiveRef.current = false;
      rgPerfMark('countdown end', {
        phase: visiblePartyRunFlow.phase,
        roomId: matchRoom?.roomId ?? null,
        source: 'party-run',
      });
    }
  }, [matchRoom?.roomId, roomCountdownRemainingSeconds, visiblePartyRunFlow.phase]);

  useEffect(() => () => {
    if (countdownTraceActiveRef.current) {
      countdownTraceActiveRef.current = false;
      rgPerfMark('countdown end', {
        reason: 'unmount',
        roomId: matchRoom?.roomId ?? null,
        source: 'party-run',
      });
    }
  }, [matchRoom?.roomId]);

  useRoomPolling({
    matchRoom,
    fastRoomPollMs,
    idleRoomPollMs,
    enabled: lifecycleController?.effects.shouldPollRoom ?? true,
    callbacksRef: callbackRef,
  });
  useCountdownReadyAck({
    currentUserId,
    matchRoom,
    matchRoomFlow,
    enabled: lifecycleController?.effects.shouldAcknowledgeCountdownReady ?? true,
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
    navigationEnabled: lifecycleController?.effects.shouldNavigateLinkedMatch ?? true,
    pollingEnabled: lifecycleController?.effects.shouldPollLinkedMatch ?? true,
    upcomingRefreshEnabled: lifecycleController?.effects.shouldRefreshUpcomingMatches ?? true,
    callbacksRef: callbackRef,
  });
}
