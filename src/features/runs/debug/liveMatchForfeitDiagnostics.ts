import { useSyncExternalStore } from 'react';
import type {
  RunningMatchLiveStatus,
  RunningMatchRoom,
  RunningMatchStatusResponse,
} from '@/lib/api/types';
import type { ArenaParticipantViewModel } from '@/features/runs/viewModels/matchViewModels';
import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';

type DebugParticipant = {
  id: string;
  label: string;
  liveStatus: RunningMatchLiveStatus | null;
  resultLabel: string | null;
  isCurrentUser: boolean;
};

type LiveMatchForfeitDiagnosticsState = {
  updatedAtMs: number | null;
  pollAtMs: number | null;
  pollSource: string | null;
  pollsBySource: Record<string, number>;
  mode: 'duel' | 'group' | 'solo' | 'room';
  matchId: string | null;
  source: string;
  duelStatusMatchId: string | null;
  groupStatusMatchId: string | null;
  currentUserLiveStatus: RunningMatchLiveStatus | null;
  opponentLiveStatus: RunningMatchLiveStatus | null;
  roomLinkedMatchId: string | null;
  roomLinkedState: string | null;
  statusParticipants: DebugParticipant[];
  roomParticipants: DebugParticipant[];
  placeholderParticipants: DebugParticipant[];
  arenaParticipants: DebugParticipant[];
};

const emptyState: LiveMatchForfeitDiagnosticsState = {
  updatedAtMs: null,
  pollAtMs: null,
  pollSource: null,
  pollsBySource: {},
  mode: 'solo',
  matchId: null,
  source: 'none',
  duelStatusMatchId: null,
  groupStatusMatchId: null,
  currentUserLiveStatus: null,
  opponentLiveStatus: null,
  roomLinkedMatchId: null,
  roomLinkedState: null,
  statusParticipants: [],
  roomParticipants: [],
  placeholderParticipants: [],
  arenaParticipants: [],
};

let state: LiveMatchForfeitDiagnosticsState = emptyState;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function normalizeStatus(value: RunningMatchLiveStatus | undefined | null): RunningMatchLiveStatus | null {
  return value ?? null;
}

function summarizeRoomParticipants(room: RunningMatchRoom | null, currentUserId: string): DebugParticipant[] {
  return (room?.participants ?? []).map((participant) => ({
    id: participant.userId,
    label: participant.name,
    liveStatus: normalizeStatus(participant.liveStatus),
    resultLabel: null,
    isCurrentUser: participant.userId === currentUserId || participant.tag === currentUserId,
  }));
}

function summarizeArenaParticipants(participants: ArenaParticipantViewModel[]): DebugParticipant[] {
  return participants.map((participant) => ({
    id: participant.id,
    label: participant.name,
    liveStatus: normalizeStatus(participant.liveStatus),
    resultLabel: participant.resultLabel ?? null,
    isCurrentUser: Boolean(participant.isCurrentUser),
  }));
}

function summarizeStatusParticipants({
  duelMatchStatus,
  groupMatchStatus,
  mode,
}: {
  duelMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatus: RunningMatchStatusResponse | null;
  mode: LiveMatchForfeitDiagnosticsState['mode'];
}): DebugParticipant[] {
  if (mode === 'duel') {
    return [
      {
        id: 'current-user',
        label: '나(status)',
        liveStatus: normalizeStatus(duelMatchStatus?.currentUserLiveStatus),
        resultLabel: null,
        isCurrentUser: true,
      },
      ...(duelMatchStatus?.opponent ? [{
        id: duelMatchStatus.opponent.id,
        label: duelMatchStatus.opponent.name,
        liveStatus: normalizeStatus(duelMatchStatus.opponent.liveStatus),
        resultLabel: null,
        isCurrentUser: false,
      }] : []),
    ];
  }

  if (mode === 'group') {
    return (groupMatchStatus?.participants ?? []).map((participant) => ({
      id: participant.id,
      label: participant.name,
      liveStatus: normalizeStatus(participant.liveStatus),
      resultLabel: null,
      isCurrentUser: groupMatchStatus?.currentUserLiveStatus === participant.liveStatus
        && participant.seedRank === groupMatchStatus?.mySeedRank,
    }));
  }

  return [];
}

export function recordLiveMatchForfeitPoll(source: string) {
  const nowMs = Date.now();
  state = {
    ...state,
    pollAtMs: nowMs,
    pollSource: source,
    pollsBySource: {
      ...state.pollsBySource,
      [source]: nowMs,
    },
  };
  emit();
}

export function recordLiveMatchForfeitDiagnosticsSnapshot({
  mode,
  matchId,
  source,
  currentUserId,
  duelMatchStatus,
  groupMatchStatus,
  roomLinkedMatchContext,
  linkedRuntimeRoom,
  placeholderParticipants,
  arenaParticipants,
}: {
  mode: LiveMatchForfeitDiagnosticsState['mode'];
  matchId: string | null;
  source: string;
  currentUserId: string;
  duelMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatus: RunningMatchStatusResponse | null;
  roomLinkedMatchContext: PartyRunLinkedMatchContext | null;
  linkedRuntimeRoom: RunningMatchRoom | null;
  placeholderParticipants: ArenaParticipantViewModel[];
  arenaParticipants: ArenaParticipantViewModel[];
}) {
  state = {
    ...state,
    updatedAtMs: Date.now(),
    mode,
    matchId,
    source,
    duelStatusMatchId: duelMatchStatus?.matchId ?? null,
    groupStatusMatchId: groupMatchStatus?.matchId ?? null,
    currentUserLiveStatus: normalizeStatus(
      mode === 'duel'
        ? duelMatchStatus?.currentUserLiveStatus
        : groupMatchStatus?.currentUserLiveStatus,
    ),
    opponentLiveStatus: normalizeStatus(
      mode === 'duel'
        ? duelMatchStatus?.opponent?.liveStatus
        : null,
    ),
    roomLinkedMatchId: roomLinkedMatchContext?.matchId ?? linkedRuntimeRoom?.linkedMatchId ?? null,
    roomLinkedState: roomLinkedMatchContext?.state ?? linkedRuntimeRoom?.linkedMatchStatus ?? linkedRuntimeRoom?.state ?? null,
    statusParticipants: summarizeStatusParticipants({ duelMatchStatus, groupMatchStatus, mode }),
    roomParticipants: summarizeRoomParticipants(linkedRuntimeRoom, currentUserId),
    placeholderParticipants: summarizeArenaParticipants(placeholderParticipants),
    arenaParticipants: summarizeArenaParticipants(arenaParticipants),
  };
  emit();
}

export function getLiveMatchForfeitDiagnostics() {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLiveMatchForfeitDiagnostics() {
  return useSyncExternalStore(
    subscribe,
    getLiveMatchForfeitDiagnostics,
    getLiveMatchForfeitDiagnostics,
  );
}
