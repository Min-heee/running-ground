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
    && (room.state === 'arming' || room.state === 'countdown' || room.state === 'active'),
  );
}

function getLinkedRoomPriority(room: RunningMatchRoom | null | undefined) {
  if (!room?.linkedMatchId) {
    return 0;
  }

  return LINKED_ROOM_STATE_PRIORITY[room.state] ?? 0;
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
  const visiblePriority = getLinkedRoomPriority(visibleMatchRoom);
  const roomPriority = getLinkedRoomPriority(matchRoom);
  const shouldUseMatchRoom = Boolean(matchRoom && roomPriority > visiblePriority);
  const room = shouldUseMatchRoom ? matchRoom : visibleMatchRoom ?? matchRoom;
  const flow = shouldUseMatchRoom ? matchRoomFlow : visiblePartyRunFlow;

  return {
    flow,
    linkedMatchContext: flow.linkedMatchContext ?? explicitLinkedMatchContext ?? null,
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
