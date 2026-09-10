import { useMemo } from 'react';
import type {
  FriendLeaderboardResponse,
  RunningMatchRoom,
  RunningMatchRoomInvitee,
} from '@/lib/api/types';
import { getMatchStartRemainingSeconds } from '@/lib/matchCountdown';
import { buildPartyRunFlowSnapshot } from '@/features/runs/lifecycle/matchStateMachine';
import {
  buildMatchRoomUxModel,
  buildPendingMatchRoomInvitees,
  isMatchRoomReservedForFuture,
  isMatchRoomScheduledSlotPassed,
} from '@/features/runs/lifecycle/matchRoomFlow';

type UseMatchRoomLobbyViewModelInput = {
  currentUserTag: string;
  friendLeaderboard: FriendLeaderboardResponse | null;
  room: RunningMatchRoom | null;
  serverClockOffsetMs: number;
};

export function useMatchRoomLobbyViewModel({
  currentUserTag,
  friendLeaderboard,
  room,
  serverClockOffsetMs,
}: UseMatchRoomLobbyViewModelInput) {
  const currentParticipant = room?.participants.find((participant) => (
    participant.userId === currentUserTag || participant.tag === currentUserTag
  )) ?? null;

  const friendOptions = useMemo(() => {
    const excludedIds = new Set<string>([currentUserTag]);

    if (room?.hostUserId) {
      excludedIds.add(room.hostUserId);
    }

    room?.participants.forEach((participant) => {
      excludedIds.add(participant.userId);
      if (participant.tag) {
        excludedIds.add(participant.tag);
      }
    });

    return (friendLeaderboard?.ranks ?? [])
      .filter((friend) => !excludedIds.has(friend.id) && (!friend.tag || !excludedIds.has(friend.tag)))
      .slice(0, 12);
  }, [currentUserTag, friendLeaderboard?.ranks, room?.hostUserId, room?.participants]);

  const pendingInvitees = useMemo<RunningMatchRoomInvitee[]>(
    () => buildPendingMatchRoomInvitees(room, friendLeaderboard?.ranks ?? []),
    [friendLeaderboard?.ranks, room],
  );

  const syncedNowMs = Date.now() + serverClockOffsetMs;
  // 예약 확정(세션 묶임 + 슬롯이 카운트다운 창 밖) 판정. 불리언으로 좁혀 메모 키에 넣는다 —
  // 시계값 자체를 키에 넣으면 매 렌더마다 모델을 다시 만든다.
  const reserved = isMatchRoomReservedForFuture(room, syncedNowMs);
  const scheduledSlotPassed = isMatchRoomScheduledSlotPassed(room, syncedNowMs);

  const roomUxModel = useMemo(
    () => buildMatchRoomUxModel({
      room,
      currentUserId: currentUserTag,
      pendingInvitees,
      reserved,
      scheduledSlotPassed,
    }),
    [currentUserTag, pendingInvitees, reserved, room, scheduledSlotPassed],
  );
  const linkedMatchRemainingSeconds = room?.linkedMatchSlotStartAt
    ? getMatchStartRemainingSeconds(room.linkedMatchSlotStartAt, syncedNowMs)
    : null;
  const partyRunFlow = buildPartyRunFlowSnapshot({
    room,
    isCountdownReady: currentParticipant?.isCountdownReady,
    remainingSeconds: linkedMatchRemainingSeconds,
    syncedNowMs,
  });

  return {
    currentParticipant,
    friendOptions,
    isInvitedOnly: roomUxModel.invite.isInvitedOnly,
    isReady: roomUxModel.readyAction.state === 'ready',
    linkedMatchRemainingSeconds,
    partyRunFlow,
    partyRunStartPhase: partyRunFlow.phase,
    roomUxModel,
    showPartyRunCountdownBanner: Boolean(
      partyRunFlow.shouldShowCountdown
      && linkedMatchRemainingSeconds !== null,
    ),
    // 예약 확정 방은 슬롯까지 몇 시간이고 linkedMatchStatus='matched'라 페이즈가 'arming'으로
    // 잡힌다 — 그 동안 '로딩중...' 배너를 띄우면 안 된다. 카운트다운 창에 들어오면 reserved가
    // 꺼지고 기존 로딩/카운트다운 배너가 그대로 이어진다.
    showPartyRunLoadingBanner: partyRunFlow.shouldShowLoading && !reserved,
  };
}
