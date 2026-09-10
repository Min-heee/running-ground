import type { RunningMatchRoom, UpcomingRunningMatchItem } from '@/lib/api/types';
import type {
  PartyRunFlowSnapshot,
  PartyRunLinkedMatchContext,
} from '@/features/runs/lifecycle/matchStateMachine';
import { isMatchRoomReservedForFuture } from '@/features/runs/lifecycle/matchRoomFlow';

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

// 러닝 탭 런타임이 '지금 곧 시작하는 매치가 붙어 있다'로 읽는 방. 예약 파티런(2026-09-09)은
// 수락 순간 링크되고 서버가 그 방을 며칠 동안 'arming'으로 보고하는데, 그걸 그대로 믿으면
// 러닝 탭이 며칠 내내 준비 화면(혼자 달리기)을 안 그리고 예정 매치 카드에서 그 예약을 지운다
// (적대 검증 2026-09-10). 카운트다운 창(30초)에 들어오면 예전 판정으로 돌아간다.
export function isLinkedRoomRuntimeState(
  room: RunningMatchRoom | null | undefined,
  syncedNowMs: number = Date.now(),
) {
  return Boolean(
    room?.linkedMatchId
    && room.joined !== false
    && (room.state === 'arming' || room.state === 'countdown' || room.state === 'active')
    && !isMatchRoomReservedForFuture(room, syncedNowMs),
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
  syncedNowMs: number = Date.now(),
) {
  if (!isLinkedRoomRuntimeState(runtimeRoom, syncedNowMs) || !runtimeRoom?.linkedMatchId) {
    return matches;
  }

  return matches.filter((match) => match.matchId !== runtimeRoom.linkedMatchId);
}
