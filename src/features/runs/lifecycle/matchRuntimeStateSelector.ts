import type { RunningMatchRoom, UpcomingRunningMatchItem } from '@/lib/api/types';
import type {
  PartyRunFlowSnapshot,
  PartyRunLinkedMatchContext,
} from '@/features/runs/lifecycle/matchStateMachine';

const LINKED_ROOM_STATE_PRIORITY: Record<RunningMatchRoom['state'], number> = {
  waiting: 1,
  arming: 2,
  countdown: 3,
  active: 4,
};

export type PartyRunRuntimeSource = {
  flow: PartyRunFlowSnapshot;
  linkedMatchContext: PartyRunLinkedMatchContext | null;
  room: RunningMatchRoom | null;
};

export function isLinkedRoomRuntimeState(room: RunningMatchRoom | null | undefined) {
  return Boolean(
    room?.linkedMatchId
    && room.joined !== false
    && (room.state === 'arming' || room.state === 'countdown' || room.state === 'active'),
  );
}

export function isInviteOnlyRuntimeRoom(room: RunningMatchRoom | null | undefined) {
  return Boolean(room && room.joined === false);
}

function getLinkedRoomPriority(room: RunningMatchRoom | null | undefined) {
  if (!room?.linkedMatchId || isInviteOnlyRuntimeRoom(room)) {
    return 0;
  }

  return LINKED_ROOM_STATE_PRIORITY[room.state] ?? 0;
}

function getRuntimeRoomCandidate(room: RunningMatchRoom | null | undefined) {
  return isInviteOnlyRuntimeRoom(room) ? null : room ?? null;
}

function withoutLinkedRuntimeFlow(flow: PartyRunFlowSnapshot): PartyRunFlowSnapshot {
  return {
    ...flow,
    phase: 'waiting',
    hasLinkedMatch: false,
    canAcknowledgeCountdownReady: false,
    canOpenLinkedMatch: false,
    shouldShowLoading: false,
    shouldShowCountdown: false,
    shouldOpenArena: false,
    shouldPreferArena: false,
    linkedMatchContext: null,
  };
}

export function selectLinkedRuntimeRoom({
  matchRoom,
  visibleMatchRoom,
}: {
  matchRoom: RunningMatchRoom | null;
  visibleMatchRoom: RunningMatchRoom | null;
}) {
  const visibleRoomCandidate = getRuntimeRoomCandidate(visibleMatchRoom);
  const matchRoomCandidate = getRuntimeRoomCandidate(matchRoom);
  const visiblePriority = getLinkedRoomPriority(visibleRoomCandidate);
  const roomPriority = getLinkedRoomPriority(matchRoomCandidate);

  if (matchRoomCandidate && roomPriority > visiblePriority) {
    return matchRoomCandidate;
  }

  return visibleRoomCandidate ?? matchRoomCandidate;
}

export function selectPartyRunRuntimeSource({
  explicitLinkedMatchContext,
  matchRoom,
  matchRoomFlow,
  visibleMatchRoom,
  visiblePartyRunFlow,
}: {
  explicitLinkedMatchContext?: PartyRunLinkedMatchContext | null;
  matchRoom: RunningMatchRoom | null;
  matchRoomFlow: PartyRunFlowSnapshot;
  visibleMatchRoom: RunningMatchRoom | null;
  visiblePartyRunFlow: PartyRunFlowSnapshot;
}): PartyRunRuntimeSource {
  const room = selectLinkedRuntimeRoom({ matchRoom, visibleMatchRoom });
  const shouldUseMatchRoom = Boolean(room && matchRoom && room === matchRoom);
  const selectedFlow = shouldUseMatchRoom ? matchRoomFlow : visiblePartyRunFlow;
  const flow = room ? selectedFlow : withoutLinkedRuntimeFlow(selectedFlow);

  return {
    flow,
    linkedMatchContext: room
      ? flow.linkedMatchContext ?? explicitLinkedMatchContext ?? null
      : explicitLinkedMatchContext ?? null,
    room,
  };
}

export function filterUpcomingMatchesForRuntime(
  matches: UpcomingRunningMatchItem[],
  runtimeRoom: RunningMatchRoom | null | undefined,
) {
  if (!isLinkedRoomRuntimeState(runtimeRoom) || !runtimeRoom?.linkedMatchId) {
    return matches;
  }

  return matches.filter((match) => match.matchId !== runtimeRoom.linkedMatchId);
}
